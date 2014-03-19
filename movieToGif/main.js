var fs = require('fs');
var path = require('path');
var async = require('async');
var parser = require('subtitles-parser');
var ffmpeg = require('fluent-ffmpeg');
var GIFEncoder = require('gifencoder');
var pngFileStream = require('png-file-stream');
var gm = require('gm');
var im = require('imagemagick');
var minimist = require('minimist');
var util = require('util');
var cp =require('child_process');

var elasticsearch = require('elasticsearch');
var elasticclient = new elasticsearch.Client({
    host: 'localhost:9200',
    log: 'trace'
});

// CONFIG
var FRAMES_PER_GIF = 30;
var FRAME_RATE = 8;
var WIDTH = 480;
var HEIGHT = 240;
// CONFIG

var MOVIE_NAME;// = 'arrow';
var SRT;// = './movieToGif/movies/arrow.srt';
var MOVIE;// = './movieToGif/movies/arrow.mp4';
var TEMP_DIR = './movieToGif/';
var OUT_DIR = './movieToGif/out/';

var SUBTITLES = [];
var CURRENT = 1;
var MAX;

var CURRENT_SUBTITLE = {};
var SCREENSHOTS_FILES = [];

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
            gif_name : gif + '.gif',
            frame_name : gif + '.png',
        }
    }, function (err, response) {
        if (err) console.error('indexation, error:', err);

        callback();
    });
}

function cleanUpFiles(callback) {
    var files = fs.readdirSync(TEMP_DIR);

    async.each(files.map(function (file) { return TEMP_DIR + file; }), fs.unlink, callback);
}

function generateTheGif(callback) {
    console.log('generateTheGif');

    var encoder = new GIFEncoder(WIDTH, HEIGHT);

    //var frames = FRAME_FILES.join(' ');
    var frames = TEMP_DIR + 'frame' + CURRENT + '_??.png';

    console.log('for pattern:', frames);

    var gifName  = OUT_DIR + MOVIE_NAME + '_' + CURRENT + '.gif';

    /*
    pngFileStream(frames)
        .pipe(encoder.createWriteStream({ repeat: 0, delay: 1000 / FRAME_RATE, quality: 3 }))
        .pipe(fs.createWriteStream(gifName))

	.on('end', function () {
        console.log('pngFileStream pipe end');
*/
    im.convert([
	frames,
	' -delay ' + (1000 / FRAME_RATE),
	' -loop 0',
	gifName
    ], function () {
        var is = fs.createReadStream(TEMP_DIR + 'frame' + CURRENT + '_15.png');
        var os = fs.createWriteStream(OUT_DIR + MOVIE_NAME + '_' + CURRENT + '.png');

        is.pipe(os);
        is.on('end', function () {
            console.log('15th frame pipe end');

            callback();
        });
    });
}

var FRAME_FILES;
function convertJPGsToPNGs(callback) {
    console.log('convertJPGsToPNGs');

    var filenames = SCREENSHOTS_FILES;

    var i = 0;
    var frameFile = '';

    async.mapSeries(filenames, function (filename, callback) {
        var numName = (i < 10 ? '0' : '') + i;

        frameFile = TEMP_DIR + 'frame' + CURRENT + '_' + numName + '.png';

        gm(filename)
            .noProfile()
            .write(frameFile, function (err) {
                if (err) return callback(err);

                callback(null, frameFile);
            });
        ++i;
    }, function (err, frameFiles) {
        if (err) return console.error('convertJPGsToPNGs, error:', err);

        FRAME_FILES = frameFiles;

        callback();
    });
}

//  sudo convert frame0_00.png srt0.png -gravity south -composite t.png
var FUSIONED_SUBTITLES = 0;
function mergeSubtitle(callback) {
    console.log('merge subs');

    FUSIONED_SUBTITLES = 0;
    var i = 0;
    while (i < SCREENSHOTS_FILES.length) {
        im.convert([
            SCREENSHOTS_FILES[i],
            TEMP_DIR + 'srt' + CURRENT + '.png',
            '-gravity', 'south',
            '-composite', SCREENSHOTS_FILES[i]
        ], function(err, stdout) {
            if (err) return console.error('mergeSubtitle, error:', err);

            FUSIONED_SUBTITLES++;
            if (FUSIONED_SUBTITLES == FRAMES_PER_GIF) {
                callback();
            }
        });
        ++i;
    }
}

function mergeWaterMark(callback) {
    console.log('watermarks');

    async.each(SCREENSHOTS_FILES, function (file, callback) {
        im.convert([
            file,
            './movieToGif/watermark.png',
            '-gravity', 'west',
            '-composite', file
        ], callback);
    }, function (err) {
        if (err) return console.error('mergeWaterMark, error:', err);

        callback();
    });
};

/*
  if (err) {console.error(err);}
  console.log('screenshots ok!');
  SCREENSHOTS_FILES = filenames;
  generateAllSubtitles();
*/
//  mplayer  -ss 00:10:00 -frames 1 -vo png,outdir=./,prefix=frameNo,z=0 -ao null ./arrow.mp4
//  mplayer -ss 61.33334333333334 -frames 1 -vo png,outdir=./movieToGif/frames/Arrow/,prefix=Test,z=0 -ao null ./movieToGif/movies/arrow.mp4

//time ffmpeg -async 1 -ss 00:00:10.001 -i James.Bond.Quantum.of.Solace.2008.720p.BRrip.x264.YIFY.mp4 -t 3 -s 400x240 -r 10  x%d.jp

function takeAllScreenShots(startTime, duration, callback) {
    /*
      var mplayerCommand = 'mplayer -ss ' + offset +
      ' -frames 1' +
      ' -vf scale=' + WIDTH + ':' + HEIGHT +
      ' -vo png:outdir=' + TEMP_DIR + ',z=0' +
      ' -ao null ' +
      MOVIE;
    */

    var ffmpegCommand = 'ffmpeg -ss ' + startTime
        + ' -i ' + MOVIE
        + ' -t ' + duration
        + ' -s ' + WIDTH + 'x' + HEIGHT
        + ' -r ' + FRAME_RATE
        + ' ' + TEMP_DIR + 'screenshot_' + MOVIE_NAME + '_' + CURRENT + '_%d.jpg';

    console.log(ffmpegCommand);
    console.log(SCREENSHOTS_FILES);

    cp.exec(ffmpegCommand, callback);
}

/**
   convert -background transparent -font Helvetica -pointsize 30 -fill white -size 600x  -gravity Center -stroke black -strokewidth 1 caption:'Hsata la visita babidta. LOrem PSum psum it sum'  new.png
*/

function generateSubtitle(callback) {
    var target = TEMP_DIR + 'srt' + CURRENT + '.png';
    var str = SUBTITLES[CURRENT].text;

    var size = 35;
    var strokeSize = "1.8";
    if (str.length > 30) {
        size = 25;
        strokeSize = "1.2";
    }
    if (str.length > 60) {
        size = 20;
        strokeSize = "0.8";
    }
    im.convert([
        '-background', 'transparent',
        '-font', 'Arial',
        '-pointsize', size,
        '-fill', 'white',
        '-size', WIDTH + 'x',
        '-gravity', 'Center',
        '-stroke', 'black',
        '-strokewidth', strokeSize,
        'caption:' + str , target
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

var delta = 0;
function generateNext(callback) {
    console.log('Starting Subtitle ' + CURRENT + ' / ' + SUBTITLES.length);

    CURRENT_SUBTITLE = SUBTITLES[CURRENT];

    var st = movieTimeFromSrtTime(CURRENT_SUBTITLE.startTime);
    var et = movieTimeFromSrtTime(CURRENT_SUBTITLE.endTime);

    /**
     * Extract timings from SRT
     */
    st -= 1.0;
    if (st < 0) {
        st = 0;
    }
    et += 1.0;

    console.log('Subtitle Length' , et - st);

    var i = 0;
    var fb = [];
    FRAMES_PER_GIF = (et - st) * FRAME_RATE;

    console.log('FRAMES COUNT', FRAMES_PER_GIF);

    var d = (et - st) / FRAMES_PER_GIF;
    delta = d;

    console.log(delta);

    SCREENSHOTS_FILES = [];
    for (i = 0; i < FRAMES_PER_GIF; ++i) {
        SCREENSHOTS_FILES.push(TEMP_DIR + 'screenshot_' + MOVIE_NAME + '_' + CURRENT + '_' + (i+1) + '.jpg');
    }

    takeAllScreenShots(
        st,
        et - st,
        function () {
            async.series([
                generateSubtitle,
                mergeWaterMark,
                mergeSubtitle,
                convertJPGsToPNGs,
                generateTheGif,
                cleanUpFiles,
                indexGif
            ], callback);
        }
    );
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
    for (var i = 0; i < data.length; ++i) {
        var str = data[i].text;
        var regex = /(<([^>]+)>)/ig;
        str = str.replace(regex, "");
        data[i].text = str;
    }
    return data;
}

function getSrtObject() {
    var srt = fs.readFileSync(SRT);
    var data = parser.fromSrt(srt.toString());
    return data;
}

function generateGif() {
    var data = getSrtObject();

    console.log('Str ok');

    data = sanitize(data);

    data = fusion(data);
    SUBTITLES = data;

    generateNext(function loop() {
        console.log('generateNext callback');

        if (MAX) {
            console.log('MAX!', CURRENT, '/', MAX);

            if (CURRENT < MAX) {
                ++CURRENT;

                generateNext(loop);
            } else {
                elasticclient.disconnect();
            }
        } else if (CURRENT < SUBTITLES.length) {
            console.log(CURRENT, '/', SUBTITLES.LENGTH);

            ++CURRENT;

            generateNext(loop);
        } else {
            elasticclient.disconnect();
        }
    });
}

var argv = minimist(process.argv.slice(2));

MOVIE_NAME = argv.name;
SRT = argv.srt;
MOVIE = argv.movie;

if (argv.from) {
    CURRENT = argv.from;
}
if (argv.to) {
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
