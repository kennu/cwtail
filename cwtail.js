const { ok } = require('assert');
const { EventEmitter } = require('events');
const { CloudWatchLogsClient, paginateDescribeLogGroups, GetLogEventsCommand, DescribeLogStreamsCommand } = require('@aws-sdk/client-cloudwatch-logs');

module.exports.CwTail = class CwTail {
  static async sleep(duration) {
    ok(Number.isInteger(duration) && duration > 0,
      'duration must be integer > 0');
    return new Promise(resolve => setTimeout(resolve, duration));
  }

  constructor() {
    /**
     * @type {CloudWatchLogsClient}
     */
    this._client = new CloudWatchLogsClient();
  }

  /**
   *
   * @param {EventEmitter} emitter
   * @return {Promise<void>}
   */
  async _createLogGroupsRetriever(emitter) {
    try {
      const pager = paginateDescribeLogGroups({client: this._client});
      for await (const pageResult of pager) {
        emitter.emit('page', pageResult);
      }
    }
    catch (err) {
      emitter.emit('error', err);
    }
    finally {
      emitter.emit('done');
    }
  }

  /**
   *
   * @param {number?} maxPages
   * @returns {EventEmitter}
   */
  createLogGroupsRetriever(maxPages) {
    const emitter = new EventEmitter();
    void this._createLogGroupsRetriever(emitter, maxPages);
    return emitter;
  }

  /**
   *
   * @param {string} logGroupName
   * @param {string} logStream
   * @returns {Promise<import('@aws-sdk/client-cloudwatch-logs').OutputLogEvent[]>}
   */
  async _getStreamEvents(logGroupName, logStream) {
    const command = new GetLogEventsCommand({
      logGroupName,
      logStreamName: logStream,
    });
    const result = await this._client.send(command);
    return result.events || [];
  }

  /**
   *
   * @param {EventEmitter} emitter
   * @param {string} logGroupName
   * @param {{numRecords: number; seenStreamTimestamps: Record<string, number>; follow: boolean; pollInterval: number;}} param2
   * @returns {Promise<void>}
   */
  async _createMessagesRetriever(emitter, logGroupName, {
    numRecords,
    seenStreamTimestamps,
    follow,
    pollInterval,
  }) {
    try {
      while (follow) {
        const command = new DescribeLogStreamsCommand({
          logGroupName,
          descending: true,
          limit: 10,
          orderBy: 'LastEventTime',
        });
        const {logStreams = []} = await this._client.send(command);
        const latestStreams = [];
        for (const logStream of logStreams) {
          if (logStream.lastEventTimestamp && logStream.logStreamName) {
            latestStreams.push(logStream.logStreamName);
          }
        }
        if (latestStreams.length === 0) {
          // No streams in group
          return;
        }
        // The streams are in descending time order; show until N records have been shown
        const allRecords = [];
        let numRead = 0;
        while (latestStreams.length > 0 && numRead < numRecords) {
          const logStream = latestStreams.shift();
          const records = await this._getStreamEvents(logGroupName, logStream);
          for (const record of records) {
            record.logStream = logStream;
            allRecords.push(record);
            numRead += 1;
          }
        }
        /** @type {Record<string, number>} */
        const newTimestamps = {};
        /** @type {undefined | string} */
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
    finally {
      emitter.emit('done');
    }
  }

  /**
   *
   * @param {string} logGroupName
   * @param {{numRecords: number; follow?: boolean; pollInterval: number}} param1
   * @returns {EventEmitter}
   */
  createMessagesRetriever(logGroupName, {
    numRecords,
    follow = false,
    pollInterval,
  }) {
    const emitter = new EventEmitter();
    /** @type {Record<string, number>} */
    const seenStreamTimestamps = {};
    void this._createMessagesRetriever(emitter, logGroupName, {
      numRecords,
      seenStreamTimestamps,
      follow,
      pollInterval,
    });
    return emitter;
  }
};
