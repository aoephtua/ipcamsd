// Copyright (c) 2022, Thorsten A. Weintz. All rights reserved.
// Licensed under the MIT license. See LICENSE in the project root for license information.

import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import moment from 'moment';
import log, { initStdout, logMessage } from './log.mjs';

export default class Ipcamsd {
    
    /**
     * Default date format of @see Ipcamsd.
     */
    static dateFormat = 'YYYYMMDD';

    /**
     * Default time format of @see Ipcamsd.
     */
    static timeFormat = 'HHmmss';

    /**
     * Default target file type used by FFmpeg for conversion.
     */
    static defaultTargetFileType = 'mp4';

    /**
     * Default HTTP request timeout in milliseconds.
     */
    static defaultHttpRequestTimeout = 5000;

    /**
     * Initializes standard output (stdout).
     */
    static initStdOutput = () => initStdout();

    /**
     * Processes command by firmwares and parameters.
     * 
     * @param {string} command The name of the command.
     * @param {string} name The name of the firmware.
     * @param {object} auth Object with values to authenticate.
     * @param {object} options Object with options for target process.
     */
    async process(command, name, auth, options) {
        command = command || 'fetch';
        
        const settings = this.#getSettings(command, options);

        return this.#iterateHosts(command, name, auth, settings);
    }

    /**
     * Iterates hosts and processes by firmware.
     * 
     * @param {string} command The name of the command.
     * @param {name} name The name of the firmware.
     * @param {object} auth Object with values to authenticate.
     * @param {object} settings Object with settings for target process.
     */
    async #iterateHosts(command, name, auth, settings) {
        const { hosts } = auth;

        const result = [];

        for (let i = 0; i < hosts.length; i++) {
            const host = hosts[i];

            if (i > 0) log('');
            log(host, chalk.green.bold);

            const firmware = await this.#getFirmwareInstanceByName(
                this.#getValueByIdx(name, i),
                host,
                this.#getObjectByIdx(auth, ['username', 'password', 'ssl'], i),
                i
            );

            if (firmware) {
                result.push(await firmware[command]?.(settings));
            } else {
                logMessage(`Firmware ${name} not found`);
            }
        }

        return result;
    }

    /**
     * Gets and validates @see object with settings of @see Ipcamsd instance.
     * 
     * @param {string} command The name of the command.
     * @param {object} options Object with options for target process.
     * @returns Object with validated settings.
     */
    #getSettings(command, options) {
        if (command === 'fetch') {
            let settings = {
                fs: {
                    directory: options.targetDirectory,
                    prefix: options.filenamePrefix,
                    name: options.filename
                },
                ffmpeg: {
                    videoFilter: options.videoFilter,
                    targetFileType:
                        options.targetFileType || Ipcamsd.defaultTargetFileType
                },
                dateTime: {
                    date: {
                        start: options.startDate,
                        end: options.endDate
                    },
                    time: {
                        start: options.startTime,
                        end: options.endTime
                    },
                    separateByDate: options.separateByDate,
                    lastMinutes: options.lastMinutes,
                    startDelay: options.startDelay
                }
            };

            settings.dateTime = this.#validateDateTime(
                settings.dateTime
            );

            return settings;
        }
    }

    /**
     * Validates date and time filter.
     * 
     * @param {object} dateTime Object with date and time values.
     * @returns Object with date and time filter.
     */
    #validateDateTime(dateTime) {
        let { date, time } = dateTime;

        if (!date.start) date.start = 'today';

        for (let key of ['start', 'end']) {
            date[key] = this.#getDateByParameters(date[key]);
            time[key] = this.#processRecordFilter(time[key]);
        }

        if (!date.end) {
            if (time.end < time.start) {
                date.end = moment(date.start).add(1, 'days').format(Ipcamsd.dateFormat);
            } else {
                date.end = date.start;
            }
        }

        if (dateTime.lastMinutes) {
            let startDate = moment().subtract(dateTime.lastMinutes, 'minutes');

            date.start = startDate.format(Ipcamsd.dateFormat);
            time.start = startDate.format(Ipcamsd.timeFormat);
        }

        return dateTime;
    }

    /**
     * Gets and formats date by parameters.
     * 
     * @param {string} date The input date value.
     * @returns String with formatted date.
     */
    #getDateByParameters(date) {
        if (date) {
            switch (date.toLowerCase()) {
                case 'today':
                    return moment().format(Ipcamsd.dateFormat);
                case 'yesterday':
                    return moment().subtract(1, 'days').format(Ipcamsd.dateFormat);
            }
        }
        
        return date;
    }

    /**
     * Processes date time filter of record entries.
     * 
     * @param {string} filter The filter value to process.
     * @returns String with record filter.
     */
    #processRecordFilter(filter) {
        if (filter) {
            filter = filter.trim();

            if (filter.length > 0) {
                if (filter.length < 6) {
                    if (filter.length === 1) {
                        filter = '0' + filter;
                    }
                    filter += '0'.repeat(6 - filter.length);
                }

                return filter;
            }
        }
    }

    /**
     * Gets firmware instance by parameters.
     * 
     * @param {string} name The input name of the firmware.
     * @param {string} host The target host of IP camera.
     * @param {object} auth Object with values to authenticate.
     * @param {number} idx Current index of host iteration.
     * @returns Firmware instance.
     */
    async #getFirmwareInstanceByName(name, host, auth, idx) {
        name = name?.toLowerCase();

        if (name) {
            const filename = fileURLToPath(import.meta.url);
            const directory = dirname(filename);

            const modulePath = path.join('firmwares', `${name}.mjs`);

            if (fs.existsSync(path.join(directory, modulePath))) {
                const Firmware = await import(`./${modulePath}`);

                if (Firmware) {
                    log(`Firmware: ${name}`, chalk.green);

                    return new Firmware.default(host, auth, idx);
                }
            }
        }
    }

    /**
     * Gets object of array by index.
     * 
     * @param {object} obj Object with input values.
     * @param {Array} names Array with field names to search.
     * @param {number} idx The target index.
     * @returns Object with values by names.
     */
    #getObjectByIdx(obj, names, idx) {
        const result = {};

        for (let name of names) {
            let value = this.#getValueByIdx(obj[`${name}s`], idx);
            
            if (value != null) {
                result[name] = value;
            }
        }

        return result;
    }
    
    /**
     * Gets value of array by index.
     * 
     * @param {Array} arr Array with values.
     * @param {number} idx The target index.
     * @returns Any data of array by index.
     */
    #getValueByIdx = (arr, idx) => arr.length > idx ? arr[idx] : arr.slice(-1)[0];
}
