# ipcamsd

[![npm](https://img.shields.io/npm/v/ipcamsd)](https://www.npmjs.com/package/ipcamsd)
![npm](https://img.shields.io/npm/dw/ipcamsd?label=↓)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/aoephtua/ipcamsd/blob/master/LICENSE)

Node.js command line tool and library for downloading, merging and converting record files of IP cameras.

## Installation

    $ npm install -g ipcamsd

## Usage

### General Options

```
Options:
  --version                 output the version number
  --host <host...>          host of ip camera (multiple: true, required)
  --firmware <firmware...>  firmware of ip camera (multiple: true, default: hi3510)
  --username <username...>  username of ip camera (multiple: true)
  --password <password...>  password of ip camera (multiple: true)
  --ssl <ssl...>            use secure socket layer (multiple: true, default: false)
  --help                    display help for command
```

### Firmwares

- hi3510 (default)
- reolink

### Commands

Use **[ipcamsd-cmd-generator](https://github.com/aoephtua/ipcamsd-cmd-generator)** to generate commands for ipcamsd.

- [fetch](#fetch)
- [list](#list)

#### fetch

Transfers and converts records of the specified parameters. This is the **default** command.

    $ ipcamsd (fetch) --start-date [YYYYMMDD|today|yesterday] --video-filter "setpts=PTS/2" --host [IP...] --username [...] --password [...]

**Note**: `-c copy` is applied to stream if array of video filter is empty. This also achieves the best speed. Add the `setpts` video filter with `PTS/30` to increase video speed up to 30x. Visit [documentation](https://ffmpeg.org/ffmpeg-filters.html) of FFmpeg to get more information about conceivable video filter parameters.

Exact time limitation is currently not implemented due to the motion detection of the cameras.

```
Options:
  --start-date <yyyymmdd|today|yesterday>  start date of records
  --end-date <yyyymmdd|today|yesterday>    end date of records
  --start-time <hhmmss>                    start time of records
  --end-time <hhmmss>                      end time of records
  --separate-by-date                       separate by date (default: false)
  --last-minutes <number>                  last minutes of records till now (start time skipped)
  --start-delay <number>                   start delay in minutes
  --target-directory <dir>                 target directory for converted files
  --target-file-type <type>                target file type used by ffmpeg for conversion
  --filename-prefix <prefix>               output filename prefix
  --filename <filename...>                 output filename (ignored on separations) (default: [])
  --video-filter <filter>                  video filter in ffmpeg required format (default: [])
```

#### list

Outputs dates and (first, last) records of specified hosts.

    $ ipcamsd list --host [IP...] --username [...] --password [...]

**Note**: The listing of Reolink recordings is currently not supported due to the API restrictions.

## Compatibility

- bedee WLAN IP Camera 1080p (IR, Outdoor, hi3510 firmware)
- Reolink 5MP PoE RLC-510A/B
- Reolink Video Doorbell PoE/WiFi

## Requirements

- [FFmpeg](https://ffmpeg.org/)

## License

This project is licensed under [MIT](https://github.com/aoephtua/ipcamsd/blob/master/LICENSE).