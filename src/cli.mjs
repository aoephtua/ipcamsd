#!/usr/bin/env node

// Copyright (c) 2022, Thorsten A. Weintz. All rights reserved.
// Licensed under the MIT license. See LICENSE in the project root for license information.

import { Command } from 'commander';
import Ipcamsd from './ipcamsd.mjs';

/**
 * Contains @see Command instance of Commander.js.
 */
const program = new Command();

/**
 * Concatenates value and previous array.
 * 
 * @param {*} value The value to concatenate.
 * @param {Array} previous Array with previous values to concatenate.
 * @returns Array with concatenated values.
 */
function collect(value, previous) {
    return previous.concat([value]);
}

/**
 * Concatenates boolean value and previous array.
 * 
 * @param {boolean} value The value to concatenate.
 * @param {Array} previous Array with previous values to concatenate.
 * @returns Array with concatenated values.
 */
function collectBoolean(value, previous) {
    return collect(value?.toLowerCase() === 'true', previous);
}

/**
 * Adds @see Command and related @see object with options to Commander.js.
 * 
 * @param {string} name The name of the command.
 * @param {boolean} isDefault Contains whether the command is default.
 * @param {function} cbAddOptions Function to attach options to instance.
 */
function addCommand(name, isDefault, cbAddOptions) {
    const cmd = program.command(name, { isDefault });

    if (cbAddOptions) {
        cbAddOptions(cmd);
    }

    cmd.action((options) => {
        const ipcamsd = new Ipcamsd();

        let opts = program.opts();
        let auth = {
            hosts: opts.host,
            usernames: opts.username,
            passwords: opts.password,
            ssls: opts.ssl
        };

        ipcamsd.process(name, opts.firmware, auth, options)
            .then(null, (err) => console.error(err));
    });
}

/**
 * Sets the program version to @see Command instance.
 */
program
    .version('1.2.0', '-v, --version');

/**
 * Adds command and related options to fetch records to @see Command instance.
 */
addCommand('fetch', true, (command) => {
    command
        .option('--start-date <yyyymmdd|today|yesterday>', 'start date of records')
        .option('--end-date <yyyymmdd|today|yesterday>', 'end date of records')
        .option('--start-time <hhmmss>', 'start time of records')
        .option('--end-time <hhmmss>', 'end time of records')
        .option('--separate-by-date', 'separate by date', false)
        .option('--last-minutes <number>', 'last minutes of records till now (start time skipped)', parseInt)
        .option('--start-delay <number>', 'start delay in minutes', parseInt)
        .option('--target-directory <dir>', 'target directory for converted files')
        .option('--target-file-type <type>', 'target file type used by ffmpeg for conversion')
        .option('--filename-prefix <prefix>', 'output filename prefix')
        .option('--video-filter <filter>', 'video filter in ffmpeg required format', collect, []);
});

/**
 * Adds command to list records to @see Command instance.
 */
addCommand('list');

/**
 * Adds default options to @see Command instance.
 */
program
    .requiredOption('--host <host...>', 'host of ip camera')
    .option('--firmware <firmware...>', 'firmware of ip camera', ['hi3510'])
    .option('--username <username...>', 'username of ip camera', [])
    .option('--password <password...>', 'password of ip camera', [])
    .option('--ssl <ssl...>', 'use secure socket layer', collectBoolean, []);

/**
 * Instance of @see Command parses command-line arguments.
 */
program.parse(process.argv);
