// Copyright (c) 2022, Thorsten A. Weintz. All rights reserved.
// Licensed under the MIT license. See LICENSE in the project root for license information.

import path from 'path';
import moment from 'moment';
import Base from './base.mjs';
import Ipcamsd from '../ipcamsd.mjs';

export default class Reolink extends Base {

    /**
     * Map object with collection of file names and their properties.
     */
    files = new Map();

    /**
     * Authenticates against the Reolink camera API and stores the session token.
     * If authentication fails due to an invalid or expired session state,
     * the method can retry the login process up to a limited number of attempts.
     * 
     * @param {number} retry Current retry attempt counter (used internally for recursive retry logic).
     * @returns {Promise<boolean>} True if login was successful, otherwise false.
     */
    async login(retry = 0) {
        const { username, password } = this.auth;

        const cmdUrl = this.#getCommandUrl('Login');

        const result = await this.httpContentRequest(cmdUrl, 'POST', [{
            'cmd': 'Login',
            'action': 0,
            'param': {
                'User': {
                    'Version': 0,
                    'userName': username,
                    'password': password
                }
            }
        }]);

        if (!result?.length || result[0].error) {
            return false;
        }

        const token = result[0].value.Token;

        if (token) {
            this.auth.token = token.name;

            if (await this.#isAuthorized()) {
                return true;
            }

            return this.#retryLogin(retry);
        }

        return false;
    }

    /**
     * Logs out from the Reolink camera API and removes the stored session token.
     * 
     * @returns {Promise<object>} API response object.
     */
    async logout() {
        const cmdUrl = this.#getCommandUrl('Logout');

        const result = await this.httpContentRequest(cmdUrl, 'POST', [{
            'cmd': 'Logout', 'param': {}
        }]);

        delete this.auth.token;

        return result;
    }

    /**
     * Lists records of IP camera (not supported for this implementation).
     * 
     * @returns {Promise<*>} Always returns logNotSupported().
     */
    list = async () => this.logNotSupported();

    /**
     * Gets records of Reolink IP camera for a given date/time range.
     * 
     * @param {object} dateTime Object containing date and time range.
     * @returns {Promise<Array>} Array of grouped recording metadata.
     */
    async getRecords(dateTime) {
        let dates = [];

        const { date, time } = dateTime;

        if (date) {
            const cmdUrl = this.#getCommandUrl('Search');

            const values = this.#getDateRange(date.start, date.end);
            const length = values.length;

            for (let i = 0; i < length; i++) {
                const value = values[i];

                await this.#requestPlaybackList(
                    dates,
                    time,
                    value,
                    cmdUrl,
                    { idx: i, length }
                );
            }
        }

        return dates;
    }

    /**
     * Downloads recorded video files for a specific date group.
     * 
     * @param {object} dateObj Object containing date and associated record filenames.
     * @param {string} dateTmpDir Temporary directory path for downloads.
     * @returns {Promise<void>}
     */
     async downloadRecordFiles(dateObj, dateTmpDir) {
        for (let record of dateObj.records) {
            const { fullName, size } = this.files.get(record);
            const start = this.#extractTimestamp(record);

            let fileUrl = this.#getCommandUrl(
                'Playback',
                `&source=${fullName}&output=${record}&channel=0&type=0&start=${start}&seek=0`
            );
            let localFile = path.join(dateTmpDir, record);

            await this.httpContentToFileStream(fileUrl, localFile, size);

            this.files.delete(record);
        }
    }

    /**
     * Extracts date or time part from a Reolink filename string.
     * 
     * @param {string} date Filename containing encoded date/time parts.
     * @param {'date'|'time'} part Which part to extract.
     * @param {boolean} start Whether to extract the start time segment.
     * @returns {string|undefined} Extracted value.
     */
    extractDatePartValue(date, part, start) {
        const parts = date?.split('_');

        if (parts.length > 1) {
            switch (part || 'date') {
                case 'date':
                    return parts[1].slice(-6);
                case 'time':
                    if (start) {
                        return parts[2];
                    } else {
                        const end = parts[3];

                        return /^0{6}$/.test(end) ? moment().format('HHmmss') : end;
                    }
            }
        }
    }

    /**
     * Sets the base URL for Reolink API requests.
     */
    setBaseUrl() {
        this.baseUrl = `${this.getProtocol()}://${this.host}/cgi-bin/api.cgi`;
    }

    /**
     * Formats @see string with date value.
     * 
     * @param {string} value The input value to format.
     * @returns String with formatted date value.
     */
    #formatDate(value) {
        const date = value.substring(0, 4);
        const start = value.substring(4, 6);
        const end = value.substring(6, 8);

        return `${date}-${start}-${end}`;
    }

    /**
     * Extracts the recording start timestamp from a Reolink recording filename.
     * 
     * Example:
     * RecM02_DST20260617_115636_120136_5328810_3B7A46D.mp4
     * -> 20260617115636
     * 
     * @param {string} filename The recording filename.
     * @returns {string|null} Timestamp in YYYYMMDDHHmmss format or null if the filename does not match.
     */
    #extractTimestamp(filename) {
        const match = filename.match(/_DST(\d{8})_(\d{6})_/);

        return match ? match[1] + match[2] : null;
    }

    /**
     * Gets @see Array with range of dates.
     * 
     * @param {string} start The start date value.
     * @param {string} end The end date value.
     * @returns Array of dates.
     */
    #getDateRange(start, end) {
        let dates = [];

        let from = moment(start || new Date(), Ipcamsd.dateFormat);
        let to = moment(end || new Date(), Ipcamsd.dateFormat);

        let duration = moment.duration(to.diff(from));
        let days = duration.asDays();

        for (let i = 0; i < days; i++) {
            if (i === 0) {
                dates.push(from);
            } else {
                dates.push(moment(from).add(i, 'd'));
            }
        }

        dates.push(to);

        return dates;
    }

    /**
     * Retries login after logout if initial authentication fails.
     * 
     * @param {number} retry Current retry attempt.
     * @returns {Promise<boolean>} True if login eventually succeeds.
     */
    async #retryLogin(retry) {
        await this.logout();

        if (retry < 2) {
            await new Promise(resolve => setTimeout(resolve, 500));

            return this.login(retry + 1);
        }

        return false;
    }

    /**
     * Checks whether the current session token is authorized.
     * 
     * @returns {Promise<boolean>} True if session is valid.
     */
    async #isAuthorized() {
        const cmdUrl = this.#getCommandUrl('GetAbility');

        const result = await this.httpContentRequest(cmdUrl, 'POST', [{
            'cmd': 'GetAbility',
            'param': {
                'User': {
                    'userName': this.auth.username
                }
            }
        }]);

        return result?.[0].code === 0;
    }

    /**
     * Requests playback list from Reolink API for a specific date.
     * 
     * @param {Array} dates Accumulated results array.
     * @param {object} time Time range object.
     * @param {moment.Moment} value Current date iteration value.
     * @param {string} cmdUrl API endpoint URL.
     * @param {object} params Loop parameters (index, length, etc.).
     * @returns {Promise<void>}
     */
    async #requestPlaybackList(dates, time, value, cmdUrl, params) {
        const data = this.#getPlaybackListPostData(
            value,
            time.start,
            time.end,
            params
        );

        const response = await this.httpContentRequest(cmdUrl, 'POST', data);

        if (response?.length) {
            const result = response[0];

            if (result.code === 0) {
                const files = result.value?.SearchResult.File;

                this.#addDate(
                    dates,
                    value.format(Ipcamsd.dateFormat),
                    files
                );
            }
        }
    }

    /**
     * Adds a date entry with associated recording files to the result array.
     * 
     * @param {Array} dates Target array for grouped results.
     * @param {string} date Formatted date string.
     * @param {Array} files List of files returned by API.
     */
    #addDate(dates, date, files) {
        if (files?.length) {
            dates.push({
                date,
                records: files.map(file => {
                    const { name: fullName, size } = file;
                    const name = this.extractFilename(fullName);

                    this.files.set(name, { fullName, size });

                    return name;
                })
            });
        }
    }

    /**
     * Builds a full command URL for the Reolink API.
     * 
     * @param {string} command API command name.
     * @param {string} queryParams Optional query string parameters.
     * @returns {string} Fully constructed request URL.
     */
    #getCommandUrl(command, queryParams) {
        const token = this.auth?.token ? `&token=${this.auth.token}` : '';

        return `${this.baseUrl}?cmd=${command}${queryParams || ''}${token}`;
    }

    /**
     * Converts date and time into Reolink API compatible object format.
     * 
     * @param {moment.Moment} date Date object.
     * @param {string} time Time string.
     * @param {object} params Loop parameters.
     * @returns {object} Structured date/time object for API request.
     */
    #getDateAndTime(date, time, params) {
        let value = moment(
            this.#getTime(time, params),
            Ipcamsd.timeFormat
        );

        return {
            'year': date.year(),
            'mon': date.month() + 1,
            'day': date.date(),
            'hour': value.hour(),
            'min': value.minutes(),
            'sec': value.seconds()
        };
    }

    /**
     * Normalizes time values depending on loop position and range rules.
     * 
     * @param {string} time Input time string.
     * @param {object} params Loop context parameters.
     * @returns {string} Normalized time string.
     */
    #getTime(time, params) {
        const { idx, length, end } = params;
        const first = idx === 0;
        const last = idx === length -1;
        const multiple = length > 1;

        const conditions = [
            !time, !first && !last,
            first && multiple && end, last && multiple && !end
        ];

        if (conditions.indexOf(true) > -1) {
            return end ? '235959' : '000000';
        }
        
        return time;
    }

    /**
     * Builds POST payload for Reolink playback search request.
     * 
     * @param {moment.Moment} date Date being queried.
     * @param {string} start Start time.
     * @param {string} end End time.
     * @param {object} params Loop parameters.
     * @returns {Array<object>} Request payload array.
     */
    #getPlaybackListPostData(date, start, end, params) {
        return [{ 
            'cmd': 'Search',
            'action': 0,
            'param': {
                'Search': {
                    'channel': 0,
                    'onlyStatus': 0,
                    'streamType': 'main',
                    'StartTime': this.#getDateAndTime(
                        date, start, params
                    ),
                    'EndTime': this.#getDateAndTime(
                        date, end, { ...params, end: true }
                    )
                }
            }
        }];
    }
}
