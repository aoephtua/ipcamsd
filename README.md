# ipcamsd

[![License](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/aoephtua/ipcamsd/blob/master/LICENSE)

Node.js command line tool and library for downloading, merging and converting .264 files of IP cameras.

## Installation

    $ npm install -g ipcamsd

## Usage

    $ ipcamsd --date [YYYYMMDD|today|yesterday] --video-filter "setpts=PTS/2" --host [IP] --username admin --password admin

**Note**: `-c copy` is applied to stream if array of video filter is empty. This also achieves the best speed. Add the `setpts` video filter with `PTS/30` to increase video speed up to 30x.

### Options

```
Options:
  -v, --version                          output the version number
  -d, --date <yyyymmdd|today|yesterday>  date of records
  -t, --target-directory <dir>           target directory for converted files
  -f, --video-filter <filter>            video filter in ffmpeg required format (default: [])
  -h, --host <host>                      host of ip camera
  -u, --username <username>              username for basic authentication
  -p, --password <password>              password for basic authentication
  --ssl                                  use secure socket layer (default: false)
```

## Compatibility

- bedee WLAN IP Camera 1080p (IR, Outdoor)

## Requirements

- [FFmpeg](https://ffmpeg.org/)

## License

This project is licensed under [MIT](https://github.com/aoephtua/ipcamsd/blob/master/LICENSE).