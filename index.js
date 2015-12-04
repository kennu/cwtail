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

/**
 * Tail specified log group, with optional follow
 */
function tail(logs, logGroup, follow) {
  return Promise.resolve();
}

function main(argv) {
  return Promise.resolve()
  .then(function () {
    var opt = new Getopt([
      ['f', 'follow', 'Follow the log (default is to exit)'],
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
    } else {
      return tail(logs, arg.argv[0], opt.follow);
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
