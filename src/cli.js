#!/usr/bin/env node

// Copyright (c) 2022, Thorsten A. Weintz. All rights reserved.
// Licensed under the MIT license. See LICENSE in the project root for license information.

'use strict';

const program = require('commander');
const ipcamsd = require('./lib');

/**
 * Concatenates value and previous array
 * @param {*} value Single value to join
 * @param {*} previous Array with previous values
 * @returns Array with concatenated values
 */
function collect(value, previous) {
    return previous.concat([value]);
}

/**
 * Adds command and related options to Commander.js
 * @param {*} name Name of command
 * @param {*} isDefault Property to set default command
 * @param {*} cbAddOptions Callback function to set additional options 
 */
function addCommand(name, isDefault, cbAddOptions) {
    const cmd = program.command(name, { isDefault });

    if (cbAddOptions) {
        cbAddOptions(cmd);
    }

    cmd.action((options) => {
        let opts = program.opts();
        let auth = {
            hosts: opts.host,
            username: opts.username,
            password: opts.password,
            ssl: opts.ssl  
        };

        ipcamsd.process(name, auth, options)
            .then(null, (err) => console.error(err));
    });
}

program
    .version('0.3.2', '-v, --version');

addCommand('fetch', true, (command) => {
    command
        .option('--start-date <yyyymmdd|today|yesterday>', 'start date of records')
        .option('--end-date <yyyymmdd|today|yesterday>', 'end date of records')
        .option('--start-time <hhmmss>', 'start time of records (name filter)')
        .option('--end-time <hhmmss>', 'end time of records (name filter)')
        .option('--separate', 'separate by date', false)
        .option('--last-minutes <number>', 'last minutes of records till now (start time skipped)', parseInt)
        .option('--start-delay <number>', 'start delay in minutes', parseInt)
        .option('--target-directory <dir>', 'target directory for converted files')
        .option('--target-file-type <type>', 'target file type used by ffmpeg for conversion')
        .option('--filename-prefix <prefix>', 'output filename prefix')
        .option('--video-filter <filter>', 'video filter in ffmpeg required format', collect, []);
});

addCommand('list');

program
    .requiredOption('--host <host...>', 'host of ip camera')
    .option('--username <username>', 'username for basic authentication')
    .option('--password <password>', 'password for basic authentication')
    .option('--ssl', 'use secure socket layer', false);
    
program.parse(process.argv);
