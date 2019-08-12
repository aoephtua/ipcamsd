#!/usr/bin/env node

// Copyright (c) 2019, Thorsten A. Weintz. All rights reserved.
// Licensed under the MIT license. See LICENSE in the project root for license information.

'use strict';

const program = require('commander');
const ipcamsd = require('./lib');

function collect(value, previous) {
    return previous.concat([value]);
}

program
    .version('0.1.6', '-v, --version')
    .option('-d, --date <yyyymmdd|today|yesterday>', 'date of records')
    .option('-s, --time-start <hhmmss>', 'start time of records (name filter)')
    .option('-e, --time-end <hhmmss>', 'end time of records (name filter)')
    .option('-t, --target-directory <dir>', 'target directory for converted files')
    .option('-y, --target-file-type <type>', 'target file type used by ffmpeg for conversion')
    .option('-f, --video-filter <filter>', 'video filter in ffmpeg required format', collect, [])
    .option('-h, --host <host>', 'host of ip camera')
    .option('-u, --username <username>', 'username for basic authentication')
    .option('-p, --password <password>', 'password for basic authentication')
    .option('--ssl', 'use secure socket layer', false);

program.parse(process.argv);

if (!program.host) {
    console.error('error: option \'-h, --host <value>\' argument missing');
    program.outputHelp();
    process.exit(1);
}

let dateTimeFilter = {
    date: program.date,
    time: {
        start: program.timeStart,
        end: program.timeEnd
    }  
};

let ffmpegParams = {
    videoFilter: program.videoFilter,
    targetFileType: program.targetFileType
};

ipcamsd.process(dateTimeFilter, program.targetDirectory, ffmpegParams, program.host, program.username, program.password, program.ssl)
    .then(null, (err) => console.error(err));