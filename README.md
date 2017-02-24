# CloudWatch Logs Tail
(C) Kenneth Falck <<kennu@iki.fi>> 2015-2017, licensed under the MIT license

## Overview

This is a simple tool for viewing Amazon AWS CloudWatch Logs on the command line.

CloudWatch Logs are stored in a simple hierarchy:

    Log Group
     +-- Log Stream
          +-- Record
              Record

When you specify the log group, cwtail will attempt to read the latest log streams in that group, and then outputs their latest records. If the -f option
is specified, cwtail then waits forever for more log records (or log streams)
to appear and outputs them.

## Installation and usage

Assuming that you have already installed and configured AWS CLI previously, you can start using cwtail immediately with no configuration:

    npm install -g cwtail
    cwtail -l

The -l option will list all existing log groups. Assuming you have a Lambda function that writes logs to the /aws/lambda/MyFunction log group, you can start tailing the logs with the following command:

    cwtail -f /aws/lambda/MyFunction

The command will show the last 30 log records and then wait for more to appear. If you invoke your Lambda function again, you should see more output within ~10 seconds.

## Advanced options

By default, cwtail outputs only the plain log messages in chronological order. You can use some additional options to show extra information.

Use the -s option to output the CloudWatch log stream names in between log records, whenever a new log stream is shown:

    cwtail -sf /aws/lambda/MyFunction

Use the -t option to output timestamps in front of each log record:

    cwtail -tf /aws/lambda/MyFunction

Use the -n option to specify how many log records should be initially shown:

    cwtail -n 1 -f /aws/lambda/MyFunction

Records added by the CloudWatch Logs Agent may not end with an end-of-line sequence.
Use the -e option to print the platform's end-of-line sequence after each log record:

    cwtail -e /var/log/syslog

## Configuration

The easiest way to configure cwtail is to install AWS CLI (https://aws.amazon.com/cli/) and configure it. The configuration is stored in ~/.aws and will be automatically used.

If you use multiple AWS profiles to access multiple AWS accounts, you can specify the profile with the AWS_PROFILE environment variable or with the -p option:

    cwtail -p myprofile -f /aws/lambda/MyFunction
