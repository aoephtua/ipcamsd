// Copyright (c) 2022, Thorsten A. Weintz. All rights reserved.
// Licensed under the MIT license. See LICENSE in the project root for license information.

import path from 'path';
import * as Cheerio from 'cheerio';
import chipcaco from 'chipcaco';
import fs from 'fs-extra';
import Base from './base.mjs';

export default class Hi3510 extends Base {

    /**
     * Array with default input options of @see Hi3510 IP camera.
     */
    defaultInputOptions = ['-r 25'];

    /**
     * Map object with collection of file names and their parent paths.
     */
    parents = new Map();

    /**
     * Gets records of @see Hi3510 IP camera.
     * 
     * @param {object} dateTime Object with date and times values.
     * @returns Array of records.
     */
    async getRecords(dateTime) {
        let dates = [];

        let startDate = dateTime.date?.start;
        let endDate = dateTime.date?.end;

        let entries = await this.#getDateEntries(startDate, endDate);

        for (let i = 0; i < entries.length; i++) {
            let value = entries[i];

            let records = await this.#get264Entries(value, dateTime);

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
     * Downloads record files of @see Hi3510 IP camera.
     * 
     * @param {object} dateObj Object with date and records.
     * @param {string} tmpDir The temporary directory of this instance.
     */
    async downloadRecordFiles(dateObj, dateTmpDir) {
        for (let i = 0; i < dateObj.records.length; i++) {
            let record = dateObj.records[i];

            let parentUrl = this.parents.get(record);

            if (parentUrl) {
                let fileUrl = parentUrl + record;
                let localFile = path.join(dateTmpDir, record);

                await this.httpContentToFileStream(fileUrl, localFile);
                await this.convertRecordFile(localFile);
            }
        }
    }

    /**
     * Converts record file to target type with @see chipcaco dependency.
     * 
     * @param {string} localFile The local filename of record to convert.
     */
    async convertRecordFile(localFile) {
        const localConvFile = `${localFile}_`;

        await chipcaco.file(localFile, localConvFile);

        fs.moveSync(localConvFile, localFile, { overwrite: true });
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
        if (date) {
            switch (part || 'date') {
                case 'date':
                    return date.slice(1, 7);
                case 'time':
                    return start ? date.slice(8, 14) : date.slice(15, 21);
            }
        }
    }

    /**
     * Sets global @see string with base URL of @see Hi3510 class.
     */
    setBaseUrl() {
        this.baseUrl = 'http' + (this.auth.ssl ? 's' : '') + `://${this.host}/sd`;
    }

    /**
     * Sets global @see object with headers for HTTP requests.
     */
    setHeaders() {
        this.headers = this.getHeadersForBasicAuthentication(
            this.auth.username,
            this.auth.password
        );
    }
    
    /**
     * Requests date entries by start and end date.
     * 
     * @param {string} startDate The start date value.
     * @param {string} endDate The end date value.
     * @returns Array of dates.
     */
    async #getDateEntries(startDate, endDate) {
        let entries = [];
        let items = await this.#getTableRowItems(this.baseUrl);

        for (let item of items) {
            let date = item.slice(0, -1);

            if ((!startDate || date >= startDate) && (!endDate || date <= endDate)) {
                entries.push(date);
            }
        }

        return entries;
    }

    /**
     * Requests parent entries by date.
     * 
     * @param {string} date The date value.
     * @returns Array of parents.
     */
    async #getParentUrls(date) {
        let urls = [];

        let url = this.#getDirectoryUrlByDate(date);
        let items = await this.#getTableRowItems(url);

        items.forEach(entry => {
            if (entry !== 'recdata.db') {
                urls.push(url + `/${entry}`);
            }
        });

        return urls;
    }

    /**
     * Requests and validates HTML body of records by date.
     * 
     * @param {string} date The date value.
     * @param {object} dateTimeFilter Object with date and time filter.
     * @returns Array of .264 records.
     */
    async #get264Entries(date, dateTimeFilter) {
        let entries = [];

        let parentUrls = await this.#getParentUrls(date);

        for (const parentUrl of parentUrls) {
            let items = await this.#getTableRowItems(parentUrl);

            items.forEach(entry => {
                if (entry.indexOf('999999') === -1 
                    && this.#isValidRecord(date, entry, dateTimeFilter)) {
                    entries.push(entry);
                    this.parents.set(entry, parentUrl);
                }
            });
        }

        return entries;
    }

    /**
     * Adds anchor text of table entries to string array.
     * 
     * @param {string} url The target URL for content request.
     * @returns Array of anchor text entries.
     */
    async #getTableRowItems(url) {
        const items = [];

        let body = await this.httpContentRequest(url);

        if (body) {
            let $ = Cheerio.load(body);
            $('table > tbody > tr').toArray().slice(3).forEach(row => {
                let anchor = $(row).find('a');

                if (anchor) {
                    items.push(anchor.text());
                }
            });
        }

        return items;
    }

    /**
     * Gets @see object with date and time filter as @see string values.
     * 
     * @param {string} date The date value.
     * @param {string} record The record name value.
     * @param {object} filter Object with filter values.
     * @param {boolean} start Contains whether to process start part.
     * @returns Object with filter and date.
     */
    #getDateAndTimeFilterAsString(date, record, filter, start) {
        const name = start ? 'start' : 'end';
        const defaultValue = start ? '000000' : '999999';

        let time = this.extractDatePartValue(record, 'time', start);

        return {
            filter: `${filter.date?.[name] || defaultValue}_${filter.time?.[name] || defaultValue}`,
            date: `${date}_${time}`
        };
    }

    /**
     * Validates date and time filter of record entries.
     * 
     * @param {string} date The date value.
     * @param {string} record The record name value.
     * @param {object} filter Object with filter values.
     * @returns Whether is valid record.
     */
    #isValidRecord(date, record, filter) {
        let start = this.#getDateAndTimeFilterAsString(date, record, filter, true);
        let end = this.#getDateAndTimeFilterAsString(date, record, filter);

        return (start.date >= start.filter || end.date >= start.filter)
            && (end.date <= end.filter || start.date <= end.filter);
    }

    /**
     * Gets @see string with full path by @see string with date directory.
     * 
     * @param {string} date The date value.
     * @returns String with directory URL.
     */
    #getDirectoryUrlByDate = (date) => this.baseUrl + `/${date}`;
}
