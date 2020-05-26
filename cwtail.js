const { ok } = require('assert');
const EventEmitter = require('events');

const { CloudWatchLogs } = require('aws-sdk');

module.exports.CwTail = class CwTail {
  static async invokeClient(client, method, ...args) {
    return new Promise((resolve, reject) => {
      client[method](...args, (err, result) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(result);
      });
    });
  }

  static async sleep(duration) {
    ok(Number.isInteger(duration) && duration > 0,
      'duration must be integer > 0');
    return new Promise(resolve => setTimeout(resolve, duration));
  }

  constructor() {
    this._client = new CloudWatchLogs();
  }

  async _createLogGroupsRetriever(emitter, maxPages) {
    const { _client } = this;
    try {
      let nextToken;
      for (let i=0; i < maxPages; i++) {
        const params = { nextToken };
        const pageResult = await CwTail.invokeClient(_client, 'describeLogGroups', params);
        emitter.emit('page', pageResult);
        nextToken = pageResult && pageResult.nextToken;
        if (!nextToken) {
          break;
        }
      }
    }
    catch (err) {
      emitter.emit('error', err);
    }
  }

  createLogGroupsRetriever(maxPages = Infinity) {
    const emitter = new EventEmitter();
    this._createLogGroupsRetriever(emitter, maxPages)
      .then(() => emitter.emit('done'));
    return emitter;
  }

  async _getStreamEvents(logGroupName, logStream) {
    const { _client } = this;
    const params = {
      logGroupName,
      logStreamName: logStream,
    };
    const result = await CwTail.invokeClient(_client, 'getLogEvents', params);
    return result && result.events || [];
  }

  async _createMessagesRetriever(emitter, logGroupName, {
    numRecords,
    seenStreamTimestamps,
    follow,
    pollInterval,
  }) {
    const { _client } = this;
    try {
      while (follow) {
        const params = {
          logGroupName,
          descending:   true,
          limit:        10,
          orderBy:      'LastEventTime'
        };
        const logStreams = await CwTail.invokeClient(_client, 'describeLogStreams', params);
        const latestStreams = logStreams && logStreams.logStreams
          .map(logStream =>
            logStream.lastEventTimestamp && logStream.logStreamName)
          .filter(v => !!v);
        if (!latestStreams || !latestStreams.length) {
          // No streams in group
          return;
        }
        // The streams are in descending time order; show until N records have been shown
        const allRecords = [];
        let numRead = 0;
        while (latestStreams.length > 0 && numRead < numRecords) {
          const logStream = latestStreams.shift();
          const records = await this._getStreamEvents(logGroupName, logStream);
          records.forEach(record =>
            record.logStream = logStream);
          allRecords.push(...records);
          //console.log('', records.length, 'record(s)');
          numRead += records.length;
        }
        const newTimestamps = {};
        let prevStream;
        for (const record of allRecords) {
          // Have we already seen this record?
          const seenTimestamp = seenStreamTimestamps[record.logStream];
          if (seenTimestamp && record.timestamp <= seenTimestamp) {
            // Yes, skip it
            continue;
          }
          if (!newTimestamps[record.logStream] || record.timestamp > newTimestamps[record.logStream]) {
            newTimestamps[record.logStream] = record.timestamp;
          }
          if (record.logStream != prevStream) {
            prevStream = record.logStream;
            emitter.emit('logstream', record.logStream);
          }
          emitter.emit('record', record);
          emitter.emit('message', record.message);
        }
        Object.keys(newTimestamps)
          .forEach(key => {
            if (!seenStreamTimestamps[key] || newTimestamps[key] > seenStreamTimestamps[key]) {
              seenStreamTimestamps[key] = newTimestamps[key];
            }
          });
        if (follow) {
          await CwTail.sleep(pollInterval);
        }
      }
    }
    catch (err) {
      emitter.emit('error', err);
    }
  }

  createMessagesRetriever(logGroupName, {
    numRecords,
    follow = false,
    pollInterval,
  }) {
    const emitter = new EventEmitter();
    const seenStreamTimestamps = {};
    this._createMessagesRetriever(emitter, logGroupName, {
      numRecords,
      seenStreamTimestamps,
      follow,
      pollInterval,
    })
      .then(() => emitter.emit('done'));
    return emitter;
  }
};
