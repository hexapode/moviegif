var fs = require('fs');
var parser = require('subtitles-parser');
var ffmpeg = require('fluent-ffmpeg');
var GIFEncoder = require('gifencoder');
var pngFileStream = require('png-file-stream');
var gm = require('gm');
var im = require('imagemagick');
var elasticsearch = require('elasticsearch');
var elasticclient = new elasticsearch.Client({
    host: 'localhost:9200',
    log: 'trace'
});


var MOVIE_NAME = 'arrow';
var SRT = './movieToGif/movies/arrow.srt';
var MOVIE = './movieToGif/movies/arrow.mp4';
var TARGET_DIR= './movieToGif/frames/';

var BUFFER = [];
var CURRENT = 0;
var CURRENT_FRAME = 0;
var CURRENT_FILES = 0;
var FRAMES_PER_SUBTITLES = 20;



function getSrtObject() {
  var srt = fs.readFileSync(SRT);
  var data = parser.fromSrt(srt.toString());
  return data;
}


function generateGif() {
  var data = getSrtObject();
  BUFFER = data;

  generateNext();
}

function movieTimeFromSrtTime(strTime) {
  // '00:41:56,520'

  var h = strTime.substr(0, 2) * 60 * 60;
  var m = strTime.substr(3, 2) * 60;
  var s = strTime.substr(6, 2) * 1;

  return s + m + h;
}

var delta = 0;
function generateNext() {
  console.log('Starting Frame ' + CURRENT + ' / ' + BUFFER.length);

  CURRENT_FRAME = BUFFER[CURRENT];
  
  var st = movieTimeFromSrtTime(CURRENT_FRAME.startTime);
  var et = movieTimeFromSrtTime(CURRENT_FRAME.endTime);



  st -= 1.0;
  if (st < 0) {
    st = 0;
  }
  et += 1.0;
  console.log('Subset Length' , et - st);
  var i = 0;
  var fb = [];
  var d = (et - st) / FRAMES_PER_SUBTITLES;
  delta = d;
  console.log(delta);
  while (i < FRAMES_PER_SUBTITLES) {
    var time = st + d * i + 0.00001;
    fb.push(new String(time));
    ++i;
  }

  var proc = new ffmpeg({ source: MOVIE})
  .withSize('600x300')
  .takeScreenshots({
      count: FRAMES_PER_SUBTITLES,
      timemarks: fb
      ,
      filename: 'screenshot' + CURRENT + '_%i'
    }, TARGET_DIR, function(err, filenames) {
      if (err) {console.log(err);}
      console.log('screenshots ok!');
        CURRENT_FILES = filenames;
      generateAllSubtitles();

  });
}

/**
convert -background transparent -font Helvetica -pointsize 30 -fill white -size 600x  -gravity Center -stroke black -strokewidth 1 caption:'Hsata la visita babidta. LOrem PSum psum it sum'  new.png
*/

var SUB_GENERATED = 0;
function generateSubtitle(target, str) {
    im.convert(['-background', 'transparent', '-font', 'Helvetica', '-pointsize', '30', '-fill', 'white', '-size', '600x', '-gravity', 'Center', '-stroke', 'black', '-strokewidth', '1', "caption:'" + str.replace(/\"/g, "'")  + "'", target], 
    function(err, stdout){
	if (err) {console.log(err);}
        mergeSubtitle();
    });
}

//  sudo convert frame0_00.png srt0.png -gravity south -composite t.png
var FUSIONED_SUBTITLES = 0;
function mergeSubtitle() {
   FUSIONED_SUBTITLES = 0;
    var i = 0;
    while (i < CURRENT_FILES.length) {
   //   console.log(TARGET_DIR + CURRENT_FILES[i]);
        im.convert([TARGET_DIR + CURRENT_FILES[i],
                   TARGET_DIR + 'srt' + CURRENT + '.png',
                    '-gravity', 'south',
                    '-composite',  TARGET_DIR + CURRENT_FILES[i]
            ], function(err, stdout) {
              if (err) {
                console.log(err);
              }
              FUSIONED_SUBTITLES++;
              if (FUSIONED_SUBTITLES == FRAMES_PER_SUBTITLES) {
                generateAPNG(CURRENT_FILES);
              }
            });
        ++i;
    }
}


function generateAllSubtitles() {
   console.log('generateTheSub');
    SUB_GENERATED = 0;
    generateSubtitle(TARGET_DIR + 'srt' + CURRENT + '.png', BUFFER[CURRENT].text);
}

var FILE_GENERATED = 0;
function generateAPNG(filenames) {
   console.log('generateThePNG');
  FILE_GENERATED = 0;
  var i = 0;
  while (i < filenames.length) {
    var numName = i;
    if (numName < 10) {
      numName = '0' + numName;
    }
    gm(TARGET_DIR + filenames[i])
      .noProfile()
      .write(TARGET_DIR + 'frame' + CURRENT + '_' +numName +  '.png', function (err) {
        if (err) console.log('gm', err);
      //  console.log(err);
        FILE_GENERATED++;
        if (FILE_GENERATED === FRAMES_PER_SUBTITLES) {
            generatetheGif();
        }
      });
    ++i;
  }
}

function generatetheGif() {
  console.log('generateTheGif');
  var encoder = new GIFEncoder(600, 300);

  pngFileStream(TARGET_DIR + '/frame' + CURRENT +'_*.png')
  .pipe(encoder.createWriteStream({ repeat: 0, delay: delta * 1000 | 0, quality: 10 }))
  .pipe(fs.createWriteStream('./movieToGif/out/' + MOVIE_NAME + '_' + (CURRENT + 1) + '.gif'));

  ++CURRENT;

  console.log('Generate Frame number : ' + CURRENT);

  indexAGif(CURRENT_FRAME.text, MOVIE_NAME + '_' + (CURRENT) + '.gif');
  if (CURRENT < BUFFER.length) {
    generateNext();
  }
}

function indexAGif(srt, gif) {
    elasticclient.create({
	index: 'srt',
	type: 'srt',
	id: gif,
	body: {
	    srt: srt,
	    gif_name : gif
	}
    }, function (err, response) {
	if (err) {
	    console.log('indexation : ', err)
	}
    });

}

generateGif();
