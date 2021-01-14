#!/usr/bin/env node

process.title = 'cwtail';

const { EOL } = require('os');
const yargs = require('yargs');

const { CwTail } = require('./cwtail.js');

const separator = Array(79).join('-');

const { argv } = yargs
  .options({
    follow: {
      type:       'boolean',
      default:    false,
      alias:      'f',
      describe:   'Follow/stream the log (default is to exit)',
    },
    num: {
      type:       'number',
      alias:      'n',
      default:    30,
      describe:   'Number of log records to show',
    },
    interval: {
      type:       'number',
      default:    5000,
      describe:   'The messages polling interval',
    },
    streams: {
      type:       'boolean',
      default:    false,
      alias:      's',
      describe:   'Show log stream names',
    },
    eol: {
      type:       'boolean',
      default:    false,
      alias:      'e',
      describe:   'Append platform end-of-line to log records',
    },
    list: {
      type:       'boolean',
      default:    false,
      alias:      'l',
      describe:   'List available log groups',
    },
    profile: {
      alias:      'p',
      default:    process.env.AWS_PROFILE,
      describe:   'Select AWS profile',
    },
    region: {
      alias:      'r',
      default:    process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION,
      describe:   'Select AWS region',
    },
  })
  .version()
  .help('h').alias('h', 'help');

// make sure aws-sdk has correct values
process.env.AWS_PROFILE = argv.profile;
process.env.AWS_REGION = process.env.AWS_DEFAULT_REGION = argv.region;

const _exitUponComplete = emitter => {
  emitter.once('error', err => {
    console.error(err);
    process.exit(1);
  });
  emitter.once('done', err => {
    process.exit(0);
  });
};

const _defaultLogger = (argv, record) => {
  process.stdout.write(record.message);
  if (argv.eol) {
    process.stdout.write(EOL);
  }
};

function main(argv) {
  const logGroupName = argv._[0];
  if (!argv.list && !logGroupName) {
    // Need log group name
    throw new Error('log group name required');
  }
  const cwtail = new CwTail();
  if (argv.list) {
    const retriever = cwtail.createLogGroupsRetriever();
    _exitUponComplete(retriever);
    retriever.on('page', page => {
      for (const logGroup of page.logGroups) {
        console.log(logGroup.logGroupName);
      }
    });
  }
  else {
    const logger = _defaultLogger.bind(null, argv);
    const retriever = cwtail.createMessagesRetriever(logGroupName, {
      numRecords:     argv.num,
      follow:         argv.follow,
      pollInterval:   argv.interval,
    });
    _exitUponComplete(retriever);
    retriever.on('record', record => {
      logger(record);
    });
    if (argv.streams) {
      retriever.on('logstream', logStream => {
        console.log(separator);
        console.log(logStream);
        console.log(separator);
      });
    }
  }
}

main(argv);
