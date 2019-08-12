// Copyright (c) 2019, Thorsten A. Weintz. All rights reserved.
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
const request = require('request');
const tmp = require('tmp');

const ipcamsd = module.exports;
const log = console.log;

/**
 * Date format used by IP cameras
 */
const DATE_FORMAT = 'YYYYMMDD';

/**
 * Default target file type used by ffmpeg for conversion
 */
const DEFAULT_TARGET_FILE_TYPE = 'mp4';

/**
 * Extracts time value from file name of record
 * @param {*} start Start or end time
 */
String.prototype.extractTimeValue = function(start) {
    let value = this.valueOf();

    return start ? value.substr(8, 14) : value.substr(15, 21);
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
 * Validates time filter of record entries
 * @param {*} record File name of record entry
 * @param {*} filter Time filter for record entry
 * @param {*} start Apply >= or <= operator
 */
function validateRecordFilter(record, filter, start) {
    if (!filter) {
        return true;
    }

    let recFrom = record.extractTimeValue(true);
    let recTo = record.extractTimeValue();

    return start ? recFrom >= filter || recTo >= filter :
        recFrom <= filter || recTo <= filter;
}

/**
 * Requests HTML body of records by date
 * @param {*} date String value with date of records
 * @param {*} timeFilter Object with time filter
 */
async function get264Entries(date, timeFilter) {
    return new Promise(resolve => {
        httpContentRequest(getRecordsDirectoryUrlByDate(date)).then(content => {
            let entries = [];
            getTableRowItems(content).forEach(entry => {
                if (entry.indexOf('999999') === -1
                    && validateRecordFilter(entry, timeFilter.start, true)
                    && validateRecordFilter(entry, timeFilter.end)) {
                    entries.push(entry);
                }
            });
            resolve(entries);
        });
    });
}

/**
 * Request date entries by parameters
 * @param {*} date String value with date of records
 */
async function getDateEntries(date) {
    return new Promise((resolve, reject) => {
        if (date) {
            resolve([date]);
        } else {
            httpContentRequest(ipcamsd.settings.baseUrl).then(content => {
                let dates = getTableRowItems(content).map(value => {
                    return value.slice(0, -1);
                });
                resolve(dates);
            }, (err) => reject(err));
        }
    });
}

/**
 * Requests all records of specified host
 */
async function getRecords() {
    return new Promise((resolve, reject) => {
        let dateTimeFilter = ipcamsd.settings.dateTimeFilter;
        let date = getDateByParameters(dateTimeFilter.date);

        getDateEntries(date).then(async entries => {
            let dates = [];

            for (let i = 0; i < entries.length; i++) {
                let value = entries[i];
                await get264Entries(value, dateTimeFilter.time).then(records => {
                    dates.push({
                        date: value,
                        records: records
                    });
                    if (entries.length == dates.length) {
                        resolve(dates);
                    }
                });
            }
        }, (err) => reject(err));
    });
}

/**
 * Creates .txt file with records paths in ffmpeg required format
 * @param {*} dateObj Object with date and Array of records
 * @param {*} dir Target directory of records
 */
function createFileList(dateObj, dir) {
    let fileName = dir + '\\' + `${dateObj.date}.txt`;
    let file = fs.createWriteStream(fileName);

    dateObj.records.forEach(record => { 
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
    let videoFilter = ipcamsd.settings.ffmpegParams.videoFilter;

    if (videoFilter.length > 0) {
        videoFilter.forEach(filter => {
            ffmpegCmd.videoFilters(filter);
        });
    } else {
        ffmpegCmd.outputOptions('-c copy');
    }
}

/**
 * Concatenates and converts .264 files to target file type
 * @param {*} dateObj Object with date and Array of records
 * @param {*} tmpDir Temporary directory with source entries
 */
async function concatenateAndConvertToTargetFile(dateObj, tmpDir) {
    return new Promise(resolve => {
        let ffmpegCmd = ffmpeg();
        let recordsFile = createFileList(dateObj, tmpDir);

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
            
        ffmpegCmd.save(path.join(ipcamsd.settings.directory || process.cwd(), getFilenameByTimeFilter(dateObj)));
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

        log(chalk.magenta('Converting with chipcaco'));
        let localConvFile = localFile + '_';
        await chipcaco.file(localFile, localConvFile);
        fs.moveSync(localConvFile, localFile, { overwrite: true });
    }
}

/**
 * Transfers, converts and merges .264 files of dates
 * @param {*} dates Array with dates and records
 * @param {*} tmpDir Temporary directory for target files
 */
async function transferConvertMerge264Files(dates, tmpDir) {
    return new Promise(async resolve => {
        for (let i = 0; i < dates.length; i++) {
            let dateObj = dates[i];

            if (dateObj.records.length > 0) {
                log(chalk.blue(dateObj.date));

                let dateTmpDir = tmpDir.name + '\\' + dateObj.date;
                fs.mkdirSync(dateTmpDir);
    
                log(chalk.magenta('Download and convert record files'));
                await downloadAndConvertRecordFiles(dateObj, dateTmpDir);
    
                log(chalk.magenta('Merging with ffmpeg'));
                await concatenateAndConvertToTargetFile(dateObj, dateTmpDir);   
            }
        }
        resolve();
    });
}

/**
 * Gets body string of HTTP content
 * @param {*} url Target content URL
 */
async function httpContentRequest(url) {
    return new Promise((resolve, reject) => {
        request.get({ url: url, headers: ipcamsd.settings.headers }, (error, response, body) => {
            if (!error && response.statusCode == 200) {
                resolve(body);
            } else {
                reject(error || `error: http status code ${response.statusCode}`);
            }
        });
    });
}

/**
 * Transfers HTTP content to file stream by URL
 * @param {*} url Target content URL
 * @param {*} filename Target file name
 */
async function httpContentToFileStream(url, filename) {
    return new Promise(resolve => {
        let receivedBytes = 0;
        let totalBytes = 0;

        let httpRequest = request({
            url: url,
            headers: ipcamsd.settings.headers
        });

        httpRequest.pipe(fs.createWriteStream(filename));
    
        httpRequest
            .on('response', data => {
                totalBytes = parseInt(data.headers['content-length']);
            })
            .on('data', chunk => {
                receivedBytes += chunk.length;
                process.stdout.clearLine();
                process.stdout.cursorTo(0);
                process.stdout.write(path.basename(filename) + ': ' + parseInt(receivedBytes * 100 / totalBytes) + '%');
            })
            .on('end', () => {
                process.stdout.write('\n');
                resolve();
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

    if (ffmpegParams.targetFileType) {
        return ffmpegParams.targetFileType.toLowerCase();
    }
    
    return DEFAULT_TARGET_FILE_TYPE;
}

/**
 * Gets target file name by date time filter
 * @param {*} dateObj Object with date and Array of records
 */
function getFilenameByTimeFilter(dateObj) {
    let date = dateObj.date;
    let timeFilter = ipcamsd.settings.dateTimeFilter.time;

    if (timeFilter.start) {
        date += `_${timeFilter.start}`;
        if (timeFilter.end) {
            date += `_${timeFilter.end}`;
        } else {
            let records = dateObj.records;
            date += `_${records[records.length-1].extractTimeValue()}`;
        }
    }

    return date + '.' + getFileTypeByFfmpegParams();
}

/**
 * Transfers, converts and merges .246 files to target directory
 * @param {*} dateTimeFilter Object with date and time filter
 * @param {*} directory Target directory for output files
 * @param {*} ffmpegParams Parameters in ffmpeg required format
 * @param {*} host Host of IP camera
 * @param {*} username Username for basic authentication
 * @param {*} password Password for basic authentication
 * @param {*} ssl Use secure socket layer as transport protocol
 */
ipcamsd.process = async (dateTimeFilter, directory, ffmpegParams, host, username, password, ssl) => new Promise((resolve, reject) => {
    commandExists('ffmpeg')
        .then(() => {
            ipcamsd.settings = {
                dateTimeFilter: dateTimeFilter,
                directory: directory,
                ffmpegParams: ffmpegParams,
                baseUrl: 'http' + (ssl ? 's' :'' ) + `://${host}/sd`,
                username: username, 
                password: password,
                headers: getHeadersForBasicAuthentication(username, password)
            };

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
        })
        .catch(() => {
            reject('ffmpeg not installed');
        });
});