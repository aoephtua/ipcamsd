// Copyright (c) 2022, Thorsten A. Weintz. All rights reserved.
// Licensed under the MIT license. See LICENSE in the project root for license information.

import chalk from 'chalk';
import fs from 'fs-extra';
import axios from 'axios';
import commandExists from 'command-exists';
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import tmp from 'tmp';
import Ipcamsd from '../ipcamsd.mjs';
import log, { logMessage, logError, writeProgress, endProgress } from '../log.mjs';

export default class Base {
    
    /**
     * Initializes new instance of @see Base.
     * 
     * @param {string} host The host to which the requests are sent.
     * @param {object} auth Object with values for authentication.
     * @param {number} idx Current index of host iteration.
     */
    constructor(host, auth, idx) {
        if (new.target === Base) {
            throw new TypeError('Cannot construct abstract instances directly');
        }

        this.host = host;
        this.auth = auth;
        this.idx = idx;

        this.setBaseUrl?.();
        this.setHeaders?.();
    }

    /**
     * Fetches records of IP camera.
     * 
     * @param {object} settings Object with all settings of @see Ipcamsd instance.
     */
    async fetch(settings) {
        this.settings = settings;

        if (await commandExists('ffmpeg')) {
            const startDelay = this.#calculateStartDelayInMs();

            return await new Promise(resolve => {
                setTimeout(() => {
                    const tmpDir = tmp.dirSync({ prefix: 'ipcamsd' });
                    const dateTime = settings.dateTime;

                    this.getRecords?.(dateTime).then(dates => {
                        this.downloadRecords(dates, tmpDir).then((result) => {
                            fs.removeSync(tmpDir.name);

                            resolve(result);
                        });
                    });
                }, startDelay);
            });
        } else {
            logMessage('FFmpeg is not installed');
        }
    }

    /**
     * Lists records of IP camera.
     */
    async list() {
        const dates = await this.getRecords?.({});

        if (dates?.length) {
            const result = [];

            for (const date of dates) {
                const records = date.records;
    
                log(date.date, chalk.magenta);
    
                if (records && records.length > 0) {
                    const first = records[0];
                    const last = records.length > 1 ? ' - ' + records.slice(-1)[0] : '';

                    const entry = first + last;

                    result.push(entry);
    
                    log(entry, chalk.white);
                }
            }

            return result;
        } else {
            this.#logNoRecordsFound();
        }
    }

    /**
     * Gets object with authorization header for basic authentication of HTTP request.
     * 
     * @param {string} username The username to authenticate.
     * @param {string} password The password to authenticate.
     * @returns Object with headers for basic authentication.
     */
    getHeadersForBasicAuthentication(username, password) {
        let headers = {};

        if (username && password) {
            headers['Authorization'] = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
        }

        return headers;
    }

    /**
     * Downloads record files by date.
     * 
     * @param {Array} dates Array with dates and records.
     * @param {string} tmpDir The temporary directory of this instance.
     */
    async downloadRecords(dates, tmpDir) {
        const result = [];

        const separateByDate = this.settings.dateTime.separateByDate;

        this.#logDownloadMessage(dates.length > 0 && !separateByDate);

        for (let i = 0; i < dates.length; i++) {
            let dateObj = dates[i];
    
            if (dateObj.records.length > 0) {
                let date = dateObj.date;
                log(date, chalk.magenta);
    
                let dateTmpDir = this.#createTmpDirForDate(tmpDir, date);

                this.#logDownloadMessage(separateByDate);
    
                await this.downloadRecordFiles(dateObj, dateTmpDir);
    
                if (separateByDate) {
                    result.push(await this.#createSeparateRecordsFile(dateObj, dateTmpDir));
                }
            } else {
                this.#logNoRecordsFound();
            }
        }
    
        const fileName = await this.#createSingleRecordsFile(separateByDate, dates, tmpDir.name);

        if (fileName) {
            result.push(fileName);
        }

        return result;
    }

    /**
     * Gets date and time parts by filename.
     * 
     * @param {string} value The filename to extract parts.
     * @returns Object with date and time parts as strings.
     */
    getDateAndTimeParts(value) {
        let content = this.extractFilename(value);

        return {
            date: this.extractDatePartValue(content),
            start: this.extractDatePartValue(content, 'time', true),
            end: this.extractDatePartValue(content, 'time')
        };
    }

    /**
     * Gets body string of HTTP content.
     * 
     * @param {string} url The target URL for content request.
     * @param {string} method The target HTTP method for content request.
     * @param {object|Array} data Data for POST request.
     * @returns Response data provided by the endpoint.
     */
    async httpContentRequest(url, method, data) {
        try {
            const response = await axios({
                url,
                method: method || 'GET',
                headers: this.headers,
                data,
                timeout: Ipcamsd.defaultHttpRequestTimeout
            });

            if (response?.status == 200) {
                return response.data;
            }
        } catch (e) {
            logError(e.message);
        }
    }

    /**
     * Transfers HTTP content to file stream by URL.
     * 
     * @param {string} fileUrl The URL of file to stream.
     * @param {string} filename The target filename of stream.
     */
    async httpContentToFileStream(fileUrl, filename) {
        const writeStream  = fs.createWriteStream(filename);
        const name = path.basename(filename);

        try {
            const { data, headers } = await axios({
                method: 'GET',
                url: fileUrl,
                headers: this.headers,
                responseType: 'stream'
            });

            let receivedBytes = 0;
            const totalBytes = headers['content-length'];

            data.on('data', chunk => {
                receivedBytes += chunk.length;

                writeProgress(
                    name,
                    `${parseInt(receivedBytes * 100 / totalBytes)}%`
                );
            });

            return new Promise((resolve, reject) => {
                let error = null;

                data.pipe(writeStream);

                writeStream.on('error', err => {
                    error = err;
                    writeStream.close();
                    reject(err);
                });

                writeStream .on('close', () => {
                    if (!error) {
                        this.#endProgress(resolve);
                    }
                });
            });
        } catch (e) {
            writeStream.close();

            logError(`${e.message} for ${name}`);
        }
    }

    /**
     * Extracts the filename part of a file path.
     * 
     * @param {string} value The absolute or relative path.
     * @returns String with extracted filename.
     */
    extractFilename = (value) => path.basename(value);

    /*
     * Prints inavailable support message to stdout.
     */
    logNotSupported = () => logMessage('Feature not supported');

    /**
     * Prints download message to stdout.
     * 
     * @param {boolean} valid Contains whether to print log message is valid.
     */
    #logDownloadMessage(valid) {
        if (valid) {
            logMessage(`1. Download${this.convertRecordFile ? ' and convert' : ''} recorded files`);
        }
    }

    /**
     * Prints none records message to stdout.
     */
    #logNoRecordsFound = () => logMessage('No records found');

    /**
     * Creates separate records file by date and time parameters.
     * 
     * @param {object} dateObj Object with date and records.
     * @param {string} dateTmpDir The temporary directory for records by date.
     * @returns String with name of file.
     */
    async #createSeparateRecordsFile(dateObj, dateTmpDir) {
        let recordsFile = this.#createFileList(dateObj.date, dateObj.records, dateTmpDir);

        const fileName = this.#getFilename(dateObj.records, true);

        await this.#concatenateAndConvertToTargetFile(recordsFile, fileName);

        return fileName;
    }

    /**
     * Creates single records file by date and time parameters.
     * 
     * @param {boolean} separateByDate Contains whether to separate target file by date.
     * @param {Array} dates Array with date and records.
     * @param {string} tmpDir The temporary directory of this instance.
     */
    async #createSingleRecordsFile(separateByDate, dates, tmpDir) {
        if (!separateByDate) {
            let records = [];

            dates.forEach(date => {
                date.records.forEach(record => {
                    records.push(path.join(date.date, record));
                });
            });

            if (records.length > 0) {
                let recordsFile = this.#createFileList('0000', records, tmpDir);

                const fileName = this.#getFilename(records);
        
                await this.#concatenateAndConvertToTargetFile(recordsFile, fileName);

                return fileName;
            }
        }
    }

    /**
     * Creates temporary directory for record files by date.
     * 
     * @param {string} tmpDir The temporary directory of this instance.
     * @param {string} date The date value.
     * @returns String with temporary directory for date.
     */
    #createTmpDirForDate(tmpDir, date) {
        let dateTmpDir = path.join(tmpDir.name, date);
        fs.mkdirSync(dateTmpDir);

        return dateTmpDir;
    }

    /**
     * Prints newline to stdout and resolves promise on progress end.
     * 
     * @param {function} resolve The function to resolve promise.
     */
    #endProgress(resolve) {
        endProgress();
        resolve();
    }

    /**
     * Concatenates and converts .264 files to target file type.
     * 
     * @param {string} recordsFile The filename to listed record files.
     * @param {string} fileName The filename for output file.
     */
    #concatenateAndConvertToTargetFile(recordsFile, fileName) {
        return new Promise(resolve => {
            let ffmpegCmd = ffmpeg();

            logMessage('2. Merge downloaded files');

            ffmpegCmd
                .on('progress', (progress) => {
                    writeProgress(
                        'FFmpeg',
                        `${progress.frames} frames processed`
                    );
                })
                .on('end', () => {
                    endProgress();

                    logMessage(`3. Create output file`);
                    log(fileName);

                    resolve();
                });
        
            ffmpegCmd
                .input(recordsFile)
                .inputOptions(this.#getInputOptions());
            
            this.#addVideoFilter(ffmpegCmd);
            
            const directory = this.settings.fs.directory || process.cwd();
            const outputFile = path.join(directory, fileName);

            ffmpegCmd.save(outputFile);
        });
    }

    /**
     * Gets Array with input options for FFmpeg command.
     * 
     * @returns Array with input options. 
     */
    #getInputOptions = () =>
        [...this.defaultInputOptions || [], '-f concat', '-safe 0'];

    /**
     * Adds video filter to FFmpeg command.
     * 
     * @param {object} ffmpegCmd The command instance of FFmpeg.
     */
    #addVideoFilter(ffmpegCmd) {
        let videoFilter = this.settings.ffmpeg?.videoFilter;

        if (videoFilter?.length > 0) {
            videoFilter.forEach(filter => {
                ffmpegCmd.videoFilters(filter);
            });
        } else {
            ffmpegCmd.outputOptions('-c copy');
        }
    }

    /**
     * Creates .txt file with records paths in FFmpeg required format.
     * 
     * @param {string} name The name of target file with list of records.
     * @param {Array} records Array with filenames of input records.
     * @param {string} dir The directory of input records. 
     */
    #createFileList(name, records, dir) {
        let fileName = path.join(dir, `${name}.txt`);
        let file = fs.createWriteStream(fileName);

        records.forEach(record => { 
            file.write(`file '${path.join(dir, record)}'` + '\r\n');
        });

        file.end();

        return fileName;
    }

    /**
     * Gets target filename by index.
     * 
     * @returns String with raw filename.
     */
    #getFilenameByIdx() {
        const { name } = this.settings.fs;

        if (name.length) {
            return name[this.idx];
        }
    }

    /**
     * Gets target filename by parameters of records.
     * 
     * @param {Array} records Array with names of records.
     * @param {boolean} separateByDate Contains whether to separate target file by date.
     * @returns String with target filename.
     */
    #getFilename(records, separateByDate) {
        if (records.length > 0) {
            let range, prefix;
            let name = this.#getFilenameByIdx();

            if (name && !separateByDate) {
                prefix = name;
            } else {
                prefix = this.#getFilenamePrefix();

                let first = this.getDateAndTimeParts(records[0]);
                range = `${first.date}_${first.start}`;

                let last = records.length > 1
                    ? this.getDateAndTimeParts(records[records.length-1]) : null;
                if (last) {
                    if (last.date !== first.date) {
                        range += `_${last.date}`;
                    }
                    range += `_${last.end}`;
                } else {
                    range += `_${first.end}`;
                }
            }

            return `${prefix}${range || ''}.${this.#getFileTypeByFfmpegParams()}`;
        }
    }

    /**
     * Gets filename prefix by custom user value and host.
     * 
     * @returns String with host optional filename prefix.
     */
    #getFilenamePrefix() {
        let prefix = this.settings.fs.prefix;
        let sep = '_';

        return (prefix ? prefix + sep : '') + this.host + sep;
    }

    /**
     * Gets file type by FFmpeg parameters or default value.
     * 
     * @returns String with target file type.
     */
    #getFileTypeByFfmpegParams() {
        let ffmpeg = this.settings.ffmpeg;

        if (ffmpeg?.targetFileType) {
            return ffmpeg.targetFileType.toLowerCase();
        }
    }

    /**
     * Calculates start delay in milliseconds.
     * 
     * @returns Number with start delay in milliseconds.
     */
    #calculateStartDelayInMs() {
        const dateTime = this.settings.dateTime;

        return dateTime.startDelay ? dateTime.startDelay * 60000 : 0;
    }
}
