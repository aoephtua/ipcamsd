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
 * Target file type used by ffmpeg for conversion
 */
const TARGET_FILE_TYPE = '.mp4';

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
 * Requests HTML body of records by date
 * @param {*} date String value with date of records
 */
async function get264Entries(date) {
    return new Promise(resolve => {
        httpContentRequest(getRecordsDirectoryUrlByDate(date)).then(content => {
            resolve(getTableRowItems(content));
        });
    });
}

/**
 * Request date entries by parameters
 * @param {*} date 
 */
async function getDateEntries(date) {
    return new Promise((resolve, reject) => {
        if (date) {
            resolve([date]);
        } else {
            httpContentRequest(ipcamsd.settings.baseUrl).then(content => {
                let dates = getTableRowItems(content).map(value => {
                    return value.splice(0, -1);
                });
                resolve(dates);
            }, (err) => reject(err));
        }
    });
}

/**
 * Requests all records of specified host
 * @param {*} date
 */
async function getRecords(date) {
    return new Promise((resolve, reject) => {
        getDateEntries(date).then(entries => {
            let dates = [];

            entries.forEach(async (value, _idx, array) => {
                await get264Entries(value).then(records => {
                    dates.push({
                        date: value,
                        records: records
                    });
                    if (array.length == dates.length) {
                        resolve(dates);
                    }
                });
            });
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
    let videoFilter = ipcamsd.settings.videoFilter;

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
            
        ffmpegCmd.save(path.join(ipcamsd.settings.directory || process.cwd(), dateObj.date + TARGET_FILE_TYPE));
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

        if (record.indexOf('999999') === -1) {
            let fileUrl = dateDirectoryUrl + '/' + record;
            let localFile = dateTmpDir + '\\' + record;
            await httpContentToFileStream(fileUrl, localFile);

            log(chalk.magenta('Converting with chipcaco'));
            let localConvFile = localFile + '_';
            await chipcaco.file(localFile, localConvFile);
            fs.moveSync(localConvFile, localFile, { overwrite: true });
        }
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

            log(chalk.blue(dateObj.date));

            let dateTmpDir = tmpDir.name + '\\' + dateObj.date;
            fs.mkdirSync(dateTmpDir);

            log(chalk.magenta('Download and convert record files'));
            await downloadAndConvertRecordFiles(dateObj, dateTmpDir);

            log(chalk.magenta('Merging with ffmpeg'));
            await concatenateAndConvertToTargetFile(dateObj, dateTmpDir);
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
 * Transfers, converts and merges .246 files to target directory
 */
ipcamsd.process = async (date, directory, videoFilter, host, username, password, ssl) => new Promise((resolve, reject) => {
    commandExists('ffmpeg')
        .then(() => {
            ipcamsd.settings = {
                directory: directory,
                videoFilter: videoFilter,
                baseUrl: 'http' + (ssl ? 's' :'' ) + `://${host}/sd`,
                username: username, 
                password: password,
                headers: getHeadersForBasicAuthentication(username, password)
            };
        
            let tmpDir = tmp.dirSync({ prefix: 'ipcamsd' });
        
            getRecords(getDateByParameters(date)).then(dates => {
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