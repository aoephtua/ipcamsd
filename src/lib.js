// Copyright (c) 2022, Thorsten A. Weintz. All rights reserved.
// Licensed under the MIT license. See LICENSE in the project root for license information.

'use strict';

const chalk = require('chalk');
const cheerio = require("cheerio");
const chipcaco = require("chipcaco");
const commandExists = require('command-exists');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs-extra');
const moment = require('moment');
const path = require("path");
const axios = require('axios').default;
const tmp = require('tmp');

const ipcamsd = module.exports;
const log = console.log;

/**
 * Date format used by IP cameras
 */
const DATE_FORMAT = 'YYYYMMDD';

/**
 * Time format used by IP cameras
 */
const TIME_FORMAT = 'HHmmss';

/**
 * Default target file type used by ffmpeg for conversion
 */
const DEFAULT_TARGET_FILE_TYPE = 'mp4';

/**
 * Extracts date value from file name of record
 */
 String.prototype.extractDateValue = function() {
    return this.valueOf().slice(1, 7);
};

/**
 * Extracts time value from file name of record
 * @param {*} start Start or end time
 */
String.prototype.extractTimeValue = function(start) {
    let value = this.valueOf();

    return start ? value.slice(8, 14) : value.slice(15, 21);
};

/**
 * Extracts file name from file path of record
 */
String.prototype.extractFilename = function() {
    return this.valueOf().split('\\').reverse()[0];
};

/**
 * Gets object with authorization header for basic authentication of HTTP request
 * @param {*} username Username for basic authentication
 * @param {*} password Password for authentication
 */
function getHeadersForBasicAuthentication(username, password) {
    let headers = {};

    if (username && password) {
        headers['Authorization'] = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
    }
    
    return headers;
}

/**
 * Gets full path of records by date string
 * @param {*} date String value with date of records
 */
function getRecordsDirectoryUrlByDate(date) {
    return ipcamsd.settings.baseUrl + `/${date}/record000`;
}

/**
 * Adds anchor text of table entries to string array
 * @param {*} body HTML body with table entries
 */
function getTableRowItems(body) {
    const items = [];

    let $ = cheerio.load(body);
    $('table > tbody > tr').toArray().slice(3).forEach(row => {
        let anchor = $(row).find('a');
        items.push(anchor.text());
    });

    return items;
}

/**
 * Validates date and time filter of record entries
 * @param {*} date Parent date of record entry
 * @param {*} record File name of record entry
 * @param {*} filter Date and time filter
 */
function isValidRecord(date, record, filter) {
    let startFilter = `${filter.date?.start || '000000'}_${filter.time?.start || '000000'}`;
    let endFilter = `${filter.date?.end || '999999'}_${filter.time?.end || '999999'}`;

    let startTime = record.extractTimeValue(true);
    let endTime = record.extractTimeValue();

    let startDate = `${date}_${startTime}`;
    let endDate = `${date}_${endTime}`;

    return (startDate >= startFilter || endDate >= startFilter)
        && (endDate <= endFilter || startDate <= endFilter);
}

/**
 * Requests HTML body of records by date
 * @param {*} date String value with date of records
 * @param {*} dateTimeFilter Object with date and time filter
 */
async function get264Entries(date, dateTimeFilter) {
    let entries = [];

    let content = await httpContentRequest(getRecordsDirectoryUrlByDate(date));
    getTableRowItems(content).forEach(entry => {
        if (entry.indexOf('999999') === -1 
            && isValidRecord(date, entry, dateTimeFilter)) {
            entries.push(entry);
        }
    });

    return entries;
}

/**
 * Request date entries by parameters
 * @param {*} startDate String value with start date of records
 * @param {*} endDate String value with end date of records
 */
async function getDateEntries(startDate, endDate) {
    let entries = [];
    let content = await httpContentRequest(ipcamsd.settings.baseUrl);
    let dates = getTableRowItems(content).map(value => value.slice(0, -1));

    for (let date of dates) {
        if ((!startDate || date >= startDate) && (!endDate || date <= endDate)) {
            entries.push(date);
        }
    }

    return entries;
}

/**
 * Requests all records of specified host
 */
async function getRecords() {
    let dates = [];

    let dateTimeFilter = ipcamsd.settings.dateTimeFilter || {};
    let startDate = dateTimeFilter.date?.start;
    let endDate = dateTimeFilter.date?.end;

    let entries = await getDateEntries(startDate, endDate);
    for (let i = 0; i < entries.length; i++) {
        let value = entries[i];

        let records = await get264Entries(value, dateTimeFilter);

        dates.push({
            date: value,
            records: records
        });

        if (entries.length == dates.length) {
            break;
        }
    }

    return dates;
}

/**
 * Creates .txt file with records paths in ffmpeg required format
 * @param {*} name String with name of .txt file
 * @param {*} records Array with records
 * @param {*} dir Target directory of records
 */
function createFileList(name, records, dir) {
    let fileName = dir + '\\' + `${name}.txt`;
    let file = fs.createWriteStream(fileName);

    records.forEach(record => { 
        file.write(`file '${dir}\\${record}'` + '\r\n');
    });

    file.end();

    return fileName;
}

/**
 * Adds video filter to ffmpeg command
 * @param {*} ffmpegCmd Instance of fluent-ffmpeg
 */
function addVideoFilter(ffmpegCmd) {
    let videoFilter = ipcamsd.settings.ffmpegParams?.videoFilter;

    if (videoFilter?.length > 0) {
        videoFilter.forEach(filter => {
            ffmpegCmd.videoFilters(filter);
        });
    } else {
        ffmpegCmd.outputOptions('-c copy');
    }
}

/**
 * Concatenates and converts .264 files to target file type
 * @param {*} recordsFile String with source file name of records
 * @param {*} fileName String with target file name
 */
function concatenateAndConvertToTargetFile(recordsFile, fileName) {
    return new Promise(resolve => {
        let ffmpegCmd = ffmpeg();

        log(chalk.cyan('Merging with ffmpeg'));

        ffmpegCmd
            .on('progress', progress => {
                log(`[ffmpeg] ${JSON.stringify(progress)}`);
            })
            .on('end', () => {
                resolve();
            });
    
        ffmpegCmd
            .input(recordsFile)
            .inputOptions(['-f concat', '-safe 0']);
            
        addVideoFilter(ffmpegCmd);
            
        const outputFile = path.join(ipcamsd.settings.directory || process.cwd(), fileName);

        ffmpegCmd.save(outputFile);
    });
}

/**
 * Downloads and converts .264 files
 * @param {*} dateObj Object with date and Array of records
 * @param {*} tmpDir Temporary directory with source entries
 */
async function downloadAndConvertRecordFiles(dateObj, dateTmpDir) {
    let dateDirectoryUrl = getRecordsDirectoryUrlByDate(dateObj.date);

    for (let j = 0; j < dateObj.records.length; j++) {
        let record = dateObj.records[j];

        let fileUrl = dateDirectoryUrl + '/' + record;
        let localFile = dateTmpDir + '\\' + record;
        await httpContentToFileStream(fileUrl, localFile);

        log(chalk.cyan('Converting with chipcaco'));
        let localConvFile = localFile + '_';
        await chipcaco.file(localFile, localConvFile);
        fs.moveSync(localConvFile, localFile, { overwrite: true });
    }
}

/**
 * Creates temporary directory for record files by date
 * @param {*} tmpDir Parent temporary directory for dates
 * @param {*} date String with date value
 * @returns String with temporary directory for date
 */
function createTmpDirForDate(tmpDir, date) {
    let dateTmpDir = tmpDir.name + '\\' + date;
    fs.mkdirSync(dateTmpDir);

    return dateTmpDir;
}

/**
 * Creates separate records file by date and time parameters
 * @param {*} dateObj Object with date time parameters
 * @param {*} dateTmpDir String with temporary directory of date
 */
async function createSeparateRecordsFile(dateObj, dateTmpDir) {
    let recordsFile = createFileList(dateObj.date, dateObj.records, dateTmpDir);

    const fileName = getFilename(dateObj.records);
    await concatenateAndConvertToTargetFile(recordsFile, fileName);
}

/**
 * Creates single records file by date and time parameters
 * @param {*} separate Contains whether to separate files
 * @param {*} dates Array with dates and records
 * @param {*} tmpDir Temporary directory for target files
 */
async function createSingleRecordsFile(separate, dates, tmpDir) {
    if (!separate) {
        let records = [];

        dates.forEach(date => {
            date.records.forEach(record => {
                records.push(`${date.date}\\${record}`);
            });
        });

        if (records.length > 0) {
            let recordsFile = createFileList('0000', records, tmpDir);

            const fileName = getFilename(records);
    
            await concatenateAndConvertToTargetFile(recordsFile, fileName);
        }
    }
}

/**
 * Transfers, converts and merges .264 files of dates
 * @param {*} dates Array with dates and records
 * @param {*} tmpDir Temporary directory for target files
 */
async function transferConvertMerge264Files(dates, tmpDir) {
    const separate = ipcamsd.settings.dateTimeFilter.separate;

    for (let i = 0; i < dates.length; i++) {
        let dateObj = dates[i];

        if (dateObj.records.length > 0) {
            let date = dateObj.date;
            log(chalk.magenta(date));

            let dateTmpDir = createTmpDirForDate(tmpDir, date);

            log(chalk.cyan('Download and convert record files'));
            await downloadAndConvertRecordFiles(dateObj, dateTmpDir);

            if (separate) {
                await createSeparateRecordsFile(dateObj, dateTmpDir);
            }
        } else {
            log(chalk.cyan('No records found'));
        }
    }

    await createSingleRecordsFile(separate, dates, tmpDir.name);
}

/**
 * Gets body string of HTTP content
 * @param {*} url Target content URL
 * @returns Response data provided by the endpoint
 */
async function httpContentRequest(url) {
    let response = await axios.get(url, { headers: ipcamsd.settings.headers });

    if (response.status == 200) {
        return response.data;
    } else {
        throw new Error(response.status);
    }
}

/**
 * Transfers HTTP content to file stream by URL
 * @param {*} fileUrl Target content URL
 * @param {*} filename Target file name
 */
async function httpContentToFileStream(fileUrl, filename) {
    const writeStream  = fs.createWriteStream(filename);

    const { data, headers} = await axios({
        method: 'GET',
        url: fileUrl,
        headers: ipcamsd.settings.headers,
        responseType: 'stream'
    });

    let receivedBytes = 0;
    const totalBytes = headers['content-length'];

    data.on('data', chunk => {
        receivedBytes += chunk.length;
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        process.stdout.write(path.basename(filename) + ': ' + parseInt(receivedBytes * 100 / totalBytes) + '%');
    });

    return new Promise((resolve, reject) => {
        let error = null;

        data.pipe(writeStream);

        writeStream.on('error', err => {
            error = err;
            writeStream .close();
            reject(err);
        });

        writeStream .on('close', () => {
            if (!error) {
                process.stdout.write('\n');
                resolve(true);
            }
        });
    });
}

/**
 * Gets and formats date by parameters
 * @param {*} date Date or specified time value
 */
function getDateByParameters(date) {
    if (date) {
        switch (date.toLowerCase()) {
            case 'today':
                return moment().format(DATE_FORMAT);
            case 'yesterday':
                return moment().subtract(1, 'days').format(DATE_FORMAT);
        }
    }
    return date;
}

/**
 * Processes date time filter of record entries
 * @param {*} filter Time filter for record entry
 */
function processRecordFilter(filter) {
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
 * Gets file type by ffmpeg parameters or default value
 */
function getFileTypeByFfmpegParams() {
    let ffmpegParams = ipcamsd.settings.ffmpegParams;

    if (ffmpegParams?.targetFileType) {
        return ffmpegParams.targetFileType.toLowerCase();
    }
    
    return DEFAULT_TARGET_FILE_TYPE;
}

/**
 * Gets date and time parts by file name
 * @param {*} value String with file name
 * @returns Object with date and time parts as strings
 */
function getDateAndTimeParts(value) {
    let content = value.extractFilename();

    return {
        date: content.extractDateValue(),
        start: content.extractTimeValue(true),
        end: content.extractTimeValue()
    };
}

/**
 * Gets target file name by parameters of records
 * @param {*} records Array with file names of records
 * @returns String with target file name
 */
function getFilename(records) {
    if (records.length > 0) {
        let range, prefix = getFilenamePrefix();

        let first = getDateAndTimeParts(records[0]);
        range = `${first.date}_${first.start}`;

        let last = records.length > 1
            ? getDateAndTimeParts(records[records.length-1]) : null;
        if (last) {
            if (last.date !== first.date) {
                range += `_${last.date}`;
            }
            range += `_${last.end}`;
        } else {
            range += `_${first.end}`;
        }

        return `${prefix}${range}.${getFileTypeByFfmpegParams()}`;
    }
}

/**
 * Gets filename prefix by custom user value and host
 */
function getFilenamePrefix() {
    let prefix = ipcamsd.settings.prefix;
    let sep = '_';
    return (prefix ? prefix + sep : '') + ipcamsd.settings.host + sep;
}

/**
 * Validates date and time filter object
 * @param {*} dateTimeFilter Object with date and time filter
 */
function validateDateTimeFilter(dateTimeFilter) {
    dateTimeFilter.date.start = getDateByParameters(dateTimeFilter.date.start);
    dateTimeFilter.date.end = getDateByParameters(dateTimeFilter.date.end);

    if (!dateTimeFilter.date.end) {
        dateTimeFilter.date.end = dateTimeFilter.date.start;
    }

    if (dateTimeFilter.lastMinutes) {
        let startDate = moment().subtract(dateTimeFilter.lastMinutes, 'minutes');
        dateTimeFilter.date.start = startDate.format(DATE_FORMAT);
        dateTimeFilter.time.start = startDate.format(TIME_FORMAT);
    }

    return dateTimeFilter;
}

/**
 * Calculates start delay in milliseconds
 * @param {*} dateTimeFilter Object with date and time filter
 */
function calculateStartDelayInMs(dateTimeFilter) {
    return dateTimeFilter.startDelay ? dateTimeFilter.startDelay * 60000 : 0;
}

/**
 * Starts process to fetch records
 */
function startFetchingRecordsProcess() {
    return new Promise((resolve, reject) => {
        let timeFilterObj = ipcamsd.settings.dateTimeFilter.time;
        timeFilterObj.start = processRecordFilter(timeFilterObj.start);
        timeFilterObj.end = processRecordFilter(timeFilterObj.end);
    
        let tmpDir = tmp.dirSync({ prefix: 'ipcamsd' });
    
        getRecords().then(dates => {
            transferConvertMerge264Files(dates, tmpDir).then(() => {
                fs.removeSync(tmpDir.name);
                resolve();
            }, (err) => reject(err));
        });
    });
}

/**
 * Iterates host values and starts working process
 * @param {*} hosts Array with host values
 * @param {*} ssl Use secure socket layer
 * @param {*} cbProcess Working process callback
 */
async function iterateHosts(hosts, ssl, cbProcess) {
    for (const host of hosts) {
        log(chalk.green.bold(host));
        ipcamsd.settings = {
            ...ipcamsd.settings,
            host,
            baseUrl: 'http' + (ssl ? 's' :'' ) + `://${host}/sd`
        };
        await cbProcess();
    }
}

/**
 * Transfers, converts and merges .246 files to target directory
 * @param {*} hosts Hosts of IP camera
 * @param {*} params Object with values of CLI options in required format
 * @returns Promise object with success and error callbacks
 */
ipcamsd.fetch = async (hosts, params) => new Promise((resolve, reject) => {
    commandExists('ffmpeg')
        .then(() => {
            let username = params.auth.username;
            let password = params.auth.password;
            let startDelay = calculateStartDelayInMs(params.dateTime);
            setTimeout(() => {
                ipcamsd.settings = {
                    dateTimeFilter: validateDateTimeFilter(params.dateTime),
                    directory: params.fs?.directory,
                    prefix: params.fs?.prefix,
                    ffmpegParams: params.ffmpeg,
                    username,
                    password,
                    headers: getHeadersForBasicAuthentication(username, password)
                };

                iterateHosts(hosts, params.auth.ssl, startFetchingRecordsProcess)
                    .then(resolve);
            }, startDelay);
        })
        .catch(() => {
            reject('ffmpeg not installed');
        });
});

/**
 * Lists date entries with records range of hosts
 * @param {*} auth Object with authentication properties
 * @returns Promise object with success and error callbacks
 */
ipcamsd.list = async (auth) => new Promise(resolve => {
    ipcamsd.settings = {
        headers: getHeadersForBasicAuthentication(auth.username, auth.password)
    };
    iterateHosts(auth.hosts, auth.ssl, async () => {
        await getRecords().then(dates => {
            for (let date of dates) {
                log(chalk.magenta(date.date));
                let records = date.records;
                if (records && records.length > 0) {
                    let first = records[0];
                    let last = records.length > 1 ? ' - ' + records[records.length - 1] : '';
                    log(chalk.white(first + last));
                }
            }
        });
    }).then(resolve);
});

/**
 * Processes parameters and executes command
 * @param {*} name Name of command
 * @param {*} auth Object with authentication properties
 * @param {*} options Object with additional options for specified command
 * @returns Promise object with success and error callbacks
 */
ipcamsd.process = async (name, auth, options) => {
    switch (name || 'fetch') {
        case 'fetch':
            return ipcamsd.fetch(auth.hosts, {
                auth: {
                    username: auth.username,
                    password: auth.password,
                    ssl: auth.ssl
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
                    date: {
                        start: options.startDate,
                        end: options.endDate
                    },
                    time: {
                        start: options.startTime,
                        end: options.endTime
                    },
                    separate: options.separate,
                    lastMinutes: options.lastMinutes,
                    startDelay: options.startDelay
                }
            });
        case 'list':
            return ipcamsd.list(auth);
    }
};
