#!/usr/bin/env node
/**
 * CloudWatch Logs Tail
 * Copyright (C) Kenneth Falck 2015
 * License: MIT
 *
 * Installation:
 * $ npm install -g cwtail
 *
 * Usage (for help):
 * $ cwtail -h
 */
var fs = require('fs');
var path = require('path');
var ini = require('ini');
var AWS = require('aws-sdk');
var Promise = require('bluebird');
var Getopt = require('node-getopt');

var DEFAULT_NUM_RECORDS = 30; // Default number of records to tail
var FOLLOW_INTERVAL = 5000; // How often to read more

/**
 * List available log groups
 */
function list(logs, nextToken) {
  return logs.describeLogGroupsAsync({
    nextToken: nextToken
  })
  .then(function (result) {
    if (result && result.logGroups) {
      result.logGroups.map(function (group) {
        console.log(group.logGroupName);
      })
    }
    if (result && result.nextToken) {
      // Load next set of results
      return list(logs, result.nextToken);
    }
  });
}

function getStreamEvents(logs, logGroup, logStream) {
  return logs.getLogEventsAsync({
    logGroupName: logGroup,
    logStreamName: logStream
  })
  .then(function (result) {
    return (result && result.events) || [];
  });
}

/**
 * Tail specified log group
 */
function tail(logs, logGroup, numRecords, showTimes, showStreams, seenStreamTimestamps) {
  return logs.describeLogStreamsAsync({
    logGroupName: logGroup,
    descending: true,
    limit: 10,
    orderBy: 'LastEventTime'
  })
  .then(function (result) {
    if (result && result.logStreams) {
      var latestStreams = [];
      result.logStreams.map(function (logStream) {
        if (logStream.lastEventTimestamp) {
          latestStreams.push(logStream.logStreamName);
        }
      });
    }
    return latestStreams;
  })
  .then(function (latestStreams) {
    if (!latestStreams || !latestStreams.length) {
      // No streams in group
      return Promise.resolve();
    }
    // The streams are in descending time order; show until N records have been shown
    var promise = Promise.resolve();
    var numRead = 0;
    var allRecords = [];
    function readMore() {
      if (!latestStreams.length) {
        // No more streams left
        return allRecords;
      }
      var logStream = latestStreams.shift();
      return getStreamEvents(logs, logGroup, logStream)
      .then(function (records) {
        records.map(function (record) {
          record.logStream = logStream;
        });
        allRecords = allRecords.concat(records);
        //console.log('', records.length, 'record(s)');
        numRead += records.length;
        if (numRead < numRecords) {
          // Keep reading more
          return readMore();
        } else {
          return allRecords;
        }
      });
    }
    return readMore();
  })
  .then(function (records) {
    if (!records) return;
    var prevStream;
    var newTimestamps = {};
    records.map(function (record) {
      // Have we already seen this record?
      var seenTimestamp = seenStreamTimestamps[record.streamName];
      if (seenTimestamp && record.timestamp <= seenTimestamp) {
        // Yes, skip it
        return;
      }
      if (!newTimestamps[record.streamName] || record.timestamp > newTimestamps[record.streamName]) {
        newTimestamps[record.streamName] = record.timestamp;
      }
      if (showStreams) {
        if (record.logStream != prevStream) {
          prevStream = record.logStream;
          console.log('------------------------------------------------------------------------------');
          console.log(record.logStream);
          console.log('------------------------------------------------------------------------------');
        }
      }
      if (showTimes) {
        process.stdout.write('[' + new Date(record.timestamp) + '] ')
      }
      process.stdout.write(record.message);
    });
    Object.keys(newTimestamps).map(function (key) {
      if (!seenStreamTimestamps[key] || newTimestamps[key] > seenStreamTimestamps[key]) {
        seenStreamTimestamps[key] = newTimestamps[key];
      }
    });
  });
}

function main(argv) {
  return Promise.resolve()
  .then(function () {
    var opt = new Getopt([
      ['f', 'follow', 'Follow the log (default is to exit)'],
      ['n', 'num=ARG', 'Number of log records to show'],
      ['s', 'streams', 'Show log stream names'],
      ['t', 'time', 'Show timestamps in log records'],
      ['l', 'list', 'List available log groups'],
      ['p', 'profile=ARG', 'Select AWS profile'],
      ['h', 'help', 'Show this help'],
      ['v', 'version', 'Show cwtail version']
    ]);
    opt.setHelp("CloudWatch Logs Tail (C) Kenneth Falck <kennu@iki.fi> 2015\n\nUsage: cwtail [options] <log group>\n\n[[OPTIONS]]\n");
    var arg = opt.bindHelp().parse(argv);
    if (arg.options.version) {
      console.log('cwtail ' + JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'))).version);
      return Promise.reject(0);
    }
    if (arg.options.profile) {
      process.env.AWS_PROFILE = arg.options.profile;
    }
    try {
      var iniFile = fs.readFileSync(path.join(process.env.HOME, '.aws', 'config'), 'utf8');
      var iniData = ini.decode(iniFile);
      var section = iniData[process.env.AWS_PROFILE ? 'profile ' + process.env.AWS_PROFILE : 'default'];
      if (section.region) {
        // Use region from config
        AWS.config.update({region: section.region});
      }
    } catch (err) {
      // Ini file not found, ignore
      console.error(err);
    }
    var logs = new AWS.CloudWatchLogs();
    Promise.promisifyAll(logs);
    if (!arg.options.list && !arg.argv.length) {
      // Need log group name
      opt.showHelp();
      return Promise.reject(1);
    }
    if (arg.options.list) {
      return list(logs);
    } else if (arg.options.follow) {
      var seenStreamTimestamps = {};
      function readNext() {
        return tail(logs, arg.argv[0], opt.num || DEFAULT_NUM_RECORDS, arg.options.time, arg.options.streams, seenStreamTimestamps)
        .then(function () {
          return new Promise(function (resolve, reject) { setTimeout(resolve, FOLLOW_INTERVAL)});
        })
        .then(function () {
          return readNext();
        })
      }
      return readNext();
    } else {
      return tail(logs, arg.argv[0], opt.num || DEFAULT_NUM_RECORDS, arg.options.time);
    }
  })
  .then(function () {
    // Successful exit
    process.exit(0);
  })
  .then(null, function (err) {
    if (err == 0) {
      process.exit(0);
    } else if (err == 1) {
      process.exit(1);
    } else {
      console.error(err);
      process.exit(1);
    }
  });
}

main(process.argv.slice(2));
