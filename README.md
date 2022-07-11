# ipcamsd

[![npm](https://img.shields.io/npm/v/ipcamsd)](https://www.npmjs.com/package/ipcamsd)
![npm](https://img.shields.io/npm/dw/ipcamsd?label=↓)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/aoephtua/ipcamsd/blob/master/LICENSE)

Node.js command line tool and library for downloading, merging and converting .264 files of IP cameras.

## Installation

    $ npm install -g ipcamsd

## Usage

### General Options

```
Options:
  --version              output the version number
  --host <host...>       host of ip camera (multiple: true, required)
  --username <username>  username for basic authentication
  --password <password>  password for basic authentication
  --ssl                  use secure socket layer (default: false)
  --help                 display help for command
```

### Commands

- [fetch](#fetch)
- [list](#list)

#### fetch

Transfers and converts records of the specified parameters. This is the **default** command.

    $ ipcamsd (fetch) --start-date [YYYYMMDD|today|yesterday] --video-filter "setpts=PTS/2" --host [IP...] --username admin --password admin

**Note**: `-c copy` is applied to stream if array of video filter is empty. This also achieves the best speed. Add the `setpts` video filter with `PTS/30` to increase video speed up to 30x. Visit [documentation](https://ffmpeg.org/ffmpeg-filters.html) of FFmpeg to get more information about conceivable video filter parameters.

Date and time filters are applied to the file names. Exact time limitation is currently not implemented due to the motion detection of the cameras.

```
Options:
  --start-date <yyyymmdd|today|yesterday>  start date of records
  --end-date <yyyymmdd|today|yesterday>    end date of records
  --start-time <hhmmss>                    start time of records (filter is applied to record name)
  --end-time <hhmmss>                      end time of records (filter is applied to record name)
  --separate                               separate by date (default: false)
  --last-minutes <number>                  last minutes of records till now (start time skipped)
  --start-delay <number>                   start delay in minutes
  --target-directory <dir>                 target directory for converted files
  --target-file-type <type>                target file type used by ffmpeg for conversion
  --filename-prefix <prefix>               output filename prefix
  --video-filter <filter>                  video filter in ffmpeg required format (default: [])
```

#### list

Outputs dates and (first, last) records of specified hosts.

    $ ipcamsd list --host [IP...] --username admin --password admin

Use **[ipcamsd-cmd-generator](https://github.com/aoephtua/ipcamsd-cmd-generator)** to generate commands for ipcamsd.

## Compatibility

- bedee WLAN IP Camera 1080p (IR, Outdoor, hi3510 firmware)

## Requirements

- [FFmpeg](https://ffmpeg.org/)

## License

This project is licensed under [MIT](https://github.com/aoephtua/ipcamsd/blob/master/LICENSE).