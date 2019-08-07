// Copyright (c) 2019, Thorsten A. Weintz. All rights reserved.
// Licensed under the MIT license. See LICENSE in the project root for license information.

'use strict';

const program = require('commander');
const ipcamsd = require('./lib');

function collect(value, previous) {
    return previous.concat([value]);
}

program
    .version('0.1.0', '-v, --version')
    .option('-d, --date <yyyymmdd|today|yesterday>', 'date of records')
    .option('-t, --target-directory <dir>', 'target directory for converted files')
    .option('-f, --video-filter <filter>', 'video filter in ffmpeg required format', collect, [])
    .option('-h', 'host of ip camera')
    .option('-u, --username <username>', 'username for basic authentication')
    .option('-p, --password <password>', 'password for basic authentication')
    .option('--ssl', 'use secure socket layer', false);

program.parse(process.argv);

if (!program.host) {
    console.error('error: option \'-h, --host <value>\' argument missing');
    program.outputHelp();
    process.exit(1);
}

ipcamsd.process(program.date, program.targetDirectory, program.videoFilter, program.host, program.username, program.password, program.ssl)
    .then(null, (err) => console.error(err));