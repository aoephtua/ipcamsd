#!/usr/bin/env node

// Copyright (c) 2021, Thorsten A. Weintz. All rights reserved.
// Licensed under the MIT license. See LICENSE in the project root for license information.

'use strict';

const program = require('commander');
const ipcamsd = require('./lib');

function collect(value, previous) {
    return previous.concat([value]);
}

program
    .version('0.1.10', '-v, --version')
    .option('-d, --date <yyyymmdd|today|yesterday>', 'date of records')
    .option('-s, --time-start <hhmmss>', 'start time of records (name filter)')
    .option('-e, --time-end <hhmmss>', 'end time of records (name filter)')
    .option('-l, --last-minutes <number>', 'last minutes of records till now (start time skipped)', parseInt)
    .option('-i, --start-delay <number>', 'start delay in minutes', parseInt)
    .option('-t, --target-directory <dir>', 'target directory for converted files')
    .option('-y, --target-file-type <type>', 'target file type used by ffmpeg for conversion')
    .option('-x, --filename-prefix <prefix>', 'output filename prefix')
    .option('-f, --video-filter <filter>', 'video filter in ffmpeg required format', collect, [])
    .option('-h, --host <host...>', 'host of ip camera')
    .option('-u, --username <username>', 'username for basic authentication')
    .option('-p, --password <password>', 'password for basic authentication')
    .option('--ssl', 'use secure socket layer', false);

program.parse(process.argv);

const options = program.opts();
const hosts = options.host;

if (!hosts) {
    console.error('error: option \'-h, --host <value>\' argument missing');
    program.outputHelp();
    process.exit(1);
}

let params = {
    auth: {
        username: options.username,
        password: options.password,
        ssl: options.ssl
    },
    fs: {
        directory: options.targetDirectory,
        prefix: options.filenamePrefix
    },
    ffmpeg: {
        videoFilter: options.videoFilter,
        targetFileType: options.targetFileType
    },
    dateTime: {
        date: options.date,
        time: {
            start: options.timeStart,
            end: options.timeEnd
        },
        lastMinutes: options.lastMinutes,
        startDelay: options.startDelay
    }
};

ipcamsd.process(hosts, params)
    .then(null, (err) => console.error(err));
