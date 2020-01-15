# ipcamsd

[![npm](https://img.shields.io/npm/v/ipcamsd)](https://www.npmjs.com/package/ipcamsd)
![npm](https://img.shields.io/npm/dw/ipcamsd?label=↓)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/aoephtua/ipcamsd/blob/master/LICENSE)

Node.js command line tool and library for downloading, merging and converting .264 files of IP cameras.

## Installation

    $ npm install -g ipcamsd

## Usage

    $ ipcamsd --date [YYYYMMDD|today|yesterday] --video-filter "setpts=PTS/2" --host [IP] --username admin --password admin

**Note**: `-c copy` is applied to stream if array of video filter is empty. This also achieves the best speed. Add the `setpts` video filter with `PTS/30` to increase video speed up to 30x.

### Options

Date and time filters are applied to the file names. Exact time limitation is currently not implemented due to the motion detection of the cameras.

```
Options:
  -v, --version                          output the version number
  -d, --date <yyyymmdd|today|yesterday>  date of records
  -s, --time-start <hhmmss>              start time of records (name filter)
  -e, --time-end <hhmmss>                end time of records (name filter)
  -l, --last-minutes <mm>                last minutes of records till now (start time skipped)
  -i, --start-delay <number>             start delay in minutes
  -t, --target-directory <dir>           target directory for converted files
  -y, --target-file-type <type>          target file type used by ffmpeg for conversion (default: mp4)
  -f, --video-filter <filter>            video filter in ffmpeg required format (default: [])
  -h, --host <host>                      host of ip camera
  -u, --username <username>              username for basic authentication
  -p, --password <password>              password for basic authentication
  --ssl                                  use secure socket layer (default: false)
```

## Compatibility

- bedee WLAN IP Camera 1080p (IR, Outdoor, hi3510 firmware)

## Requirements

- [FFmpeg](https://ffmpeg.org/)

## License

This project is licensed under [MIT](https://github.com/aoephtua/ipcamsd/blob/master/LICENSE).