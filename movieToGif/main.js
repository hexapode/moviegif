var fs = require('fs');
var path = require('path');
var async = require('async');
var parser = require('subtitles-parser');
var ffmpeg = require('fluent-ffmpeg');

var im = require('imagemagick');
var minimist = require('minimist');
var util = require('util');
var cp =require('child_process');

var elasticsearch = require('elasticsearch');
var elasticclient = new elasticsearch.Client({
    host: 'localhost:9200',
//    log: 'trace'
});

// CONFIG
var FRAME_RATE = 10;
var WIDTH = 640;
var HEIGHT = 360;
// CONFIG

var MOVIE_NAME;
var MOVIE_BEAUTY;
var MOVIE;
var MOVIE_LIST;

var TEMP_DIR = './movieToGif/';
var OUT_DIR = './movieToGif/out/';

var SUBTITLES = [];
var CURRENT = 0;
var CURRENT_MOVIE = 0;
var MOVIE_LIST = [];
var MAX;

var CURRENT_SUBTITLE = {};
var FRAMES_FILES = [];

function indexGif(callback) {
    var srt = CURRENT_SUBTITLE.text;
    var gif = MOVIE_NAME + '_' + CURRENT;

    console.log('indexGif');

    elasticclient.create({
        index: 'srt',
        type: 'srt',
        id: gif,
        body: {
            srt: srt,
            movie: MOVIE_NAME,
            gif_name: gif + '.gif',
            frame_name: gif + '.png',
            movie_name: MOVIE_BEAUTY,
        }
    }, function (err, response) {
        if (err) console.error('indexation, error:', err);

        // do not return err, it is probably a "key already exists" error
        callback();
    });
}

function cleanUpFiles(callback) {
    console.log('cleaning up files');

    var files = fs.readdirSync(TEMP_DIR);

    async.each(files.map(function (file) { return TEMP_DIR + file; }), fs.unlink, callback);
}

function generateThumbnail(callback) {
    console.log('generating thumbnail');

    var is = fs.createReadStream(TEMP_DIR + 'frame_' + CURRENT + '_15.png');
    var os = fs.createWriteStream(OUT_DIR + MOVIE_NAME + '_' + CURRENT + '.png');

    is.pipe(os);
    is.on('end', function () {
        console.log('15th frame pipe end');

        callback();
    });
}

function generateTheGif(callback) {
    console.log('generating the gif');

    console.log(FRAMES_FILES[0] , '=>', FRAMES_FILES[FRAMES_FILES.length - 1]);

    var frames = TEMP_DIR + 'frame_' + CURRENT + '_??.png';
    var gifName = OUT_DIR + MOVIE_NAME + '_' + CURRENT + '.gif';

    im.convert([
        '-delay', (100 / FRAME_RATE) | 0,
        '-loop', '0',
        frames,
        gifName
    ], function (err) {
        if (err) console.error(err);

        callback(err);
    });
}

function addSubtitleAndWatermark(callback) {
    console.log('add sub and watermark');

    async.map(FRAMES_FILES, function (file, callback) {
        var fileName = file.replace(/\.jpg$/, '.png');

        im.convert([
            file,
            // add subtitle
            TEMP_DIR + 'srt' + CURRENT + '.png',
            '-gravity', 'south',
            '-composite',
            // add watermark
            './movieToGif/watermark.png',
            '-gravity', 'west',
            '-composite',
            fileName
        ], function (err) {
            if (err) return callback(err);

            callback(null, fileName);
        });
    }, function (err, files) {
        if (err) console.error('addSubtitleAndWatermark, error:', err);

        FRAMES_FILES = files;

        callback(err);
    });
};

function srtTimeToSeconds(strTime) {
    // '00:41:56,520' -> XXXXX.XXXs

    var h = strTime.substr(0, 2) * 60 * 60;
    var m = strTime.substr(3, 2) * 60;
    var s = strTime.substr(6, 2) * 1;
    var ms = strTime.substr(9, 3) * 0.001;

    return h + m + s + ms;
}

function zeroPadding(n) {
    return (n < 10 ? '0' : '') + n;
}

function secondsToSrtTime(seconds) {
    // XXXXX.XXXs => '00:41:56,520'

    var h = zeroPadding(Math.floor(seconds / 60 / 60));
    var m = zeroPadding(Math.floor(seconds / 60));
    var s = zeroPadding(Math.floor(seconds));
    var ms = Math.floor((seconds - Math.floor(seconds)) * 1000);

    return h + ':' + m + ':' + s + ',' + ms;
}

function takeAllScreenShots(callback) {
    console.log('current subtitle:', CURRENT_SUBTITLE);

    var startTime = Math.max(srtTimeToSeconds(CURRENT_SUBTITLE.startTime) - 1.0, 0) | 0;
    var endTime = srtTimeToSeconds(CURRENT_SUBTITLE.endTime) + 1.0;
    var duration = endTime - startTime;
    var framesCount = duration * FRAME_RATE - 1;

    console.log('starTime:', startTime, '/ endTime:', endTime);
    console.log('Subtitle length:' , duration);
    console.log('Frames count:', framesCount);

    FRAMES_FILES = [];

    var i;
    for (i = 1; i <= framesCount; ++i) {
        FRAMES_FILES.push(TEMP_DIR + 'frame_' + CURRENT + '_' + i + '.jpg');
    }

    var ffmpegCommand = 'ffmpeg'
        + ' -ss ' + startTime
        + ' -i "' + MOVIE + '"'
        + ' -t ' + duration
        + ' -s ' + WIDTH + 'x' + HEIGHT
        + ' -r ' + FRAME_RATE
        + ' -qscale 2'
        + ' ' + TEMP_DIR + 'frame_' + CURRENT + '_%d.jpg';

    console.log(ffmpegCommand);

    cp.exec(ffmpegCommand, function (err) {
        if (err) console.error(err);

        callback(err);
    });
}

function generateSubtitle(callback) {
    var target = TEMP_DIR + 'srt' + CURRENT + '.png';
    var str = SUBTITLES[CURRENT].text;

    var size = 32;
    var strokeSize = "1.8";

    if (str.length > 60) {
        size = 26;
        strokeSize = "1.5";
    }
    else if (str.length > 30) {
        size = 28;
        strokeSize = "1.5";
    }
    im.convert([
        '-background', 'transparent',
        '-font', 'AG Foreigner',
        '-pointsize', size,
        '-stroke', '#111111',
        '-strokewidth', strokeSize,
        '-fill', '#ffffff',
        '-size', WIDTH + 'x',
        '-gravity', 'Center',
        "caption:'" + str + "'",
        '-font', 'AG Foreigner',
        '-pointsize', size,
        '-stroke', 'none',
        '-fill', '#ffffff',
        '-size', WIDTH + 'x',
        '-gravity', 'Center',
        "caption:'" + str + "'",
        target
    ], function(err, stdout) {
        if (err) console.error(err);

        callback(err);
    });
}

function generateNext(callback) {
    console.log('=== Starting Subtitle ' + CURRENT + ' / ' + SUBTITLES.length);

    CURRENT_SUBTITLE = SUBTITLES[CURRENT];

    async.series([
        takeAllScreenShots,
        generateSubtitle,
        addSubtitleAndWatermark,
        generateTheGif,
        generateThumbnail,
        cleanUpFiles,
        indexGif
    ], callback);
}

function hasPunctuation(str) {
    console.log(str)

    if (str.indexOf('.') != -1) {
        return true;
    }
    if (str.indexOf('!') != -1) {
        return true;
    }
    if (str.indexOf('?') != -1) {
        return true;
    }
    return false;
}

function fusion(data) {
    console.log('fusioning sentences');

    var out = [];

    for (var i = 0; i < data.length; ++i) {
        var str = data[i];
        out.push(str);
        if (hasPunctuation(str.text)) {

        }
        else {
            if (str.text.length > 150) {

            }
            else if (data[i + 1] && hasPunctuation(data[i + 1].text)) {
                str.text += ' ' + data[i + 1].text;
                out.push(str);
            }
        }
    }
    return out;
}

function sanitize(data) {
    console.log('sanitizing SRT');

    data.forEach(function (srt) {
        var str = srt.text;
        var ltgtRegex = /(<([^>]+)>)/ig;
        var bracketRegex = /(\[([^\]]+)\])/ig;

        srt.text = str.replace(ltgtRegex, "")
            .replace(bracketRegex, "")
            .replace(/\n/g, " ")
            .replace(/\'/g, "\\'");
    });
}

function parseSrtFile(file) {
    console.log('reading SRT file');

    return parser.fromSrt(
        fs.readFileSync(file).toString()
    );
}

function generateGif(srtFile) {
    var data = parseSrtFile(srtFile);

    sanitize(data);

    SUBTITLES = fusion(data);

    generateNext(function loop() {
        console.log('gif generation complete');

        if (MAX !== undefined) {
            console.log('MAX!', CURRENT, '/', MAX);

            if (CURRENT < MAX) {
                ++CURRENT;

                generateNext(loop);
            }
            else {
                elasticclient.disconnect();
            }
        }
        else if (CURRENT < SUBTITLES.length - 1) {
            console.log(CURRENT, '/', SUBTITLES.length);

            ++CURRENT;

            generateNext(loop);
        }
        else {
            if (CURRENT_MOVIE < MOVIE_LIST.length) {
                loadNextMovie();
            }
            else {
                elasticclient.disconnect();
            }
        }
    });
}

function initMovieGeneration(argv) {
      if (!MOVIE_BEAUTY) {
        console.log('argument --beauty "Beautified name" required!');
        process.exit(1);
    }

    if (argv.from !== undefined) {
        CURRENT = argv.from;
    }
    if (argv.to !== undefined) {
        MAX = argv.to;
    }



    // TEMP_DIR = '/mnt/ramdisk/frames/' + MOVIE_NAME + '/';
    TEMP_DIR = './movieToGif/frames/' + MOVIE_NAME + '/';

    try {
        var stats = fs.statSync(TEMP_DIR);

        console.log('stats:', stats);

        if (!stats || !stats.isDirectory()) {
            fs.mkdirSync(TEMP_DIR);
        }
    } catch (e) {
        console.log(TEMP_DIR + ': no such file or directory, creating...');

        fs.mkdirSync(TEMP_DIR);
    }

    console.log('starting Generation');

    generateGif(SRT);
}

function loadNextMovie() {
    CURRENT = 0;
    MOVIE_NAME = MOVIE_LIST[CURRENT_MOVIE].name;
    SRT = MOVIE_LIST[CURRENT_MOVIE].srt;
    MOVIE = MOVIE_LIST[CURRENT_MOVIE].movie;
    MOVIE_BEAUTY = MOVIE_LIST[CURRENT_MOVIE].beauty;

    initMovieGeneration({});
    CURRENT_MOVIE++;
}


var argv = minimist(process.argv.slice(2));

MOVIE_NAME = argv.name;
MOVIE = argv.movie;
MOVIE_BEAUTY = argv.beauty;

var movieListFile = argv.movieList;
SRT = argv.srt;



if (movieListFile) {
    MOVIE_LIST = require(movieListFile);
    loadNextMovie();
}
else {

  initMovieGeneration(argv);
}



