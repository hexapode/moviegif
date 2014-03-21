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
var FRAMES_PER_GIF = 30;
var FRAME_RATE = 8;
var WIDTH = 480;
var HEIGHT = 240;
// CONFIG

var MOVIE_NAME;
var MOVIE_BEAUTY;
var SRT;
var MOVIE;

var TEMP_DIR = './movieToGif/';
var OUT_DIR = './movieToGif/out/';

var SUBTITLES = [];
var CURRENT = 0;
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

    var frames = TEMP_DIR + 'frame_' + CURRENT + '_??.png';
    var gifName  = OUT_DIR + MOVIE_NAME + '_' + CURRENT + '.gif';

    im.convert([
        frames,
        ' -delay ' + (1000 / FRAME_RATE) | 0,
        ' -loop 0',
        gifName
    ], callback);
}

function addSubtitleAndWatermark(callback) {
    console.log('add sub and watermark');

    async.each(FRAMES_FILES, function (file, callback) {
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
            file.replace(/\.jpg/, '.png')
        ], callback);
    }, function (err) {
        if (err) return console.error('addSubtitleAndWatermark, error:', err);

        callback();
    });
};

function takeAllScreenShots(callback) {
    var startTime = (movieTimeFromSrtTime(CURRENT_SUBTITLE.startTime) - 1.0) | 0;
    var endTime = movieTimeFromSrtTime(CURRENT_SUBTITLE.endTime) + 1.0;
    var duration = endTime - startTime;
    var delta = duration / FRAMES_PER_GIF;
    FRAMES_PER_GIF = duration * FRAME_RATE;

    console.log('Subtitle Length:' , duration);
    console.log('FRAMES COUNT:', FRAMES_PER_GIF);
    console.log('delta:', delta);

    FRAMES_FILES = [];

    var i = 0;
    for (i = 0; i < FRAMES_PER_GIF; ++i) {
        FRAMES_FILES.push(TEMP_DIR + 'frame_' + CURRENT + '_' + (i + 1) + '.jpg');
    }

    var ffmpegCommand = 'ffmpeg -ss ' + startTime
        + ' -i ' + MOVIE
        + ' -t ' + duration
        + ' -s ' + WIDTH + 'x' + HEIGHT
        + ' -r ' + FRAME_RATE
        + ' ' + TEMP_DIR + 'frame_' + CURRENT + '_%d.jpg';

    console.log(ffmpegCommand);

    cp.exec(ffmpegCommand, callback);
}

function generateSubtitle(callback) {
    var target = TEMP_DIR + 'srt' + CURRENT + '.png';
    var str = SUBTITLES[CURRENT].text;

    var size = 32;
    var strokeSize = "1.8";

    if (str.length > 60) {
        size = 26;
        strokeSize = "1.0";
    }
    else if (str.length > 30) {
        size = 28;
        strokeSize = "1.2";
    }
    im.convert([
        '-background', 'transparent',
        '-font', 'Helvetica Bold',
        '-pointsize', size,
        '-fill', '#ffffff',
        '-size', WIDTH + 'x',
        '-gravity', 'Center',
        '-stroke', '#111111',
        '-strokewidth', strokeSize,
        'caption:' + str ,
        target
    ], function(err, stdout) {
        if (err) return console.error(err);

        callback();
    });
}

function movieTimeFromSrtTime(strTime) {
    // '00:41:56,520'

    var h = strTime.substr(0, 2) * 60 * 60;
    var m = strTime.substr(3, 2) * 60;
    var s = strTime.substr(6, 2) * 1;

    return s + m + h;
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
            .replace(/\n/g, " ");
    });
}

function getSrtObject() {
    console.log('reading SRT file');

    var srt = fs.readFileSync(SRT);
    var data = parser.fromSrt(srt.toString());
    return data;
}

function generateGif() {
    var data = getSrtObject();

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
        else if (CURRENT < SUBTITLES.length) {
            console.log(CURRENT, '/', SUBTITLES.length);

            ++CURRENT;

            generateNext(loop);
        }
        else {
            elasticclient.disconnect();
        }
    });
}

var argv = minimist(process.argv.slice(2));

MOVIE_NAME = argv.name;
SRT = argv.srt;
MOVIE = argv.movie;
MOVIE_BEAUTY = argv.beauty;

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

generateGif();
