// Copyright (c) 2022, Thorsten A. Weintz. All rights reserved.
// Licensed under the MIT license. See LICENSE in the project root for license information.

import moment from 'moment';
import Base from './base.mjs';
import Ipcamsd from '../ipcamsd.mjs';

export default class Reolink extends Base {
    
    /**
     * Gets records of @see Reolink IP camera.
     * 
     * @param {object} dateTime Object with date and times values.
     * @returns Array of records.
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
     * Downloads record files of @see Reolink IP camera.
     * 
     * @param {object} dateObj Object with date and records.
     * @param {string} tmpDir The temporary directory of this instance.
     */
     async downloadRecordFiles(dateObj, dateTmpDir) {
        for (let record of dateObj.records) {
            let date = this.#formatDate(dateObj.date);
            let fileUrl = this.#getCommandUrl(
                'Playback',
                `&source=Mp4Record/${date}/${record}&output=${record}`
            );
            let localFile = dateTmpDir + '\\' + record;

            await this.httpContentToFileStream(fileUrl, localFile);
        }
    }

    /**
     * Extracts date or time part from @see string value.
     * 
     * @param {string} date The date value to extract.
     * @param {string} part The part to extract from date.
     * @param {boolean} start Contains whether to extract start part.
     * @returns String with date part value.
     */
    extractDatePartValue(date, part, start) {
        const value = date?.split(/_(.*)/s)[1];

        if (value) {
            switch (part || 'date') {
                case 'date':
                    return value.slice(2, 8);
                case 'time':
                    return start ? value.slice(9, 15) : value.slice(16, 22);
            }
        }
    }

    /**
     * Sets global @see string with base URL of @see Reolink class.
     */
    setBaseUrl() {
        const { username, password } = this.auth;
        const queryParams = `user=${username}&password=${password}`;

        this.baseUrl = `http${this.auth.ssl ? 's' : ''}://${this.host}/cgi-bin/api.cgi?${queryParams}`;
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
     * Requests plackback list of @see Reolink IP camera by parameters.
     * 
     * @param {Array} dates Array with date values.
     * @param {object} time Object with time values.
     * @param {date} value The date value.
     * @param {string} cmdUrl The command URL.
     * @param {object} params Object with parameters to process.
     */
    async #requestPlaybackList(dates, time, value, cmdUrl, params) {
        const data = this.#getPlaybackListPostData(
            value,
            time.start,
            time.end,
            params
        );

        const result = await this.httpContentRequest(cmdUrl, 'POST', data);

        if (result) {
            this.#addDate(
                dates,
                value.format(Ipcamsd.dateFormat),
                result
            );
        }
    }

    /**
     * Adds @see object with date values to @see Array of dates.
     * 
     * @param {Array} dates Array with date values.
     * @param {string} date The date value.
     * @param {Array} result Array with result values of HTTP request.
     */
    #addDate(dates, date, result) {
        if (result) {
            const files = result[0]?.value?.SearchResult.File;

            if (files) {
                dates.push({
                    date,
                    records: files.map(file => 
                        this.extractFilename(file.name)
                    )
                });
            }
        }
    }

    /**
     * Gets @see string with command URL and query parameters.
     * 
     * @param {string} command The command value.
     * @param {string} queryParams The command query parameters.
     * @returns String with command URL.
     */
    #getCommandUrl(command, queryParams) {
        return `${this.baseUrl}&cmd=${command}${queryParams || ''}`;
    }

    /**
     * Gets @see object with date and time parts.
     * 
     * @param {date} date The date value.
     * @param {string} time The time value.
     * @param {object} params Object with parameters to process.
     * @returns Object with date and time values.
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
     * Gets @see string with formatted time by parameters and conditions.
     * 
     * @param {string} time The time value.
     * @param {object} params Objects with parameters to process.
     * @returns String with formatted time.
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
     * Gets @see Array with search @see object and date parameters.
     * 
     * @param {date} date The date value.
     * @param {string} start The start part value.
     * @param {string} end The end part value.
     * @param {object} params Object with parameters to process.
     * @returns Array of request data with parameters.
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
