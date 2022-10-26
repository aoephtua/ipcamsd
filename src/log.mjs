// Copyright (c) 2022, Thorsten A. Weintz. All rights reserved.
// Licensed under the MIT license. See LICENSE in the project root for license information.

import chalk from 'chalk';

/**
 * Prints content to stdout.
 * 
 * @param {string} content The content to print to stdout.
 * @param {function} style Function to style content print.
 */
const log = (content, style) => {
    content = style?.(content) || content;

    console.log(content);
};

/**
 * Prints message to stdout.
 * 
 * @param {string} content The content to print to stdout.
 */
const logMessage = (content) => log(content, chalk.cyan);

/**
 * Prints error to stdout.
 * 
 * @param {string} content The content to print to stdout.
 */
const logError = (content) => logMessage(`Error: ${content}`);

/**
 * Prints progress name and value to stdout.
 * 
 * @param {string} name The name of progress to stdout.
 * @param {string} value The value of progress to stdout.
 */
const writeProgress = (name, value) => {
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    process.stdout.write(`${name ? `${name}: ` : ''}${value}`);
};

/**
 * Prints newline to stdout on progress end.
 */
const endProgress = () => process.stdout.write('\n');

/**
 * Exports primary log function as default.
 */
export default log;

/**
 * Exports secondary functions.
 */
export {
    logMessage,
    logError,
    writeProgress,
    endProgress
};
