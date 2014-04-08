var elasticsearch = require('elasticsearch');
var client = new elasticsearch.Client({
    host: 'localhost:9200',
    log: 'trace'
});

exports.index = function(req, res) {
    var id = req.params.id;

    client.search({
      index: 'srt',
      type: 'srt',
	    id: id
    }, function(err, results){
    	if (err) throw new Error(err);
      console.log('RESULT' + results);
      var arr = id.split('_');
      var num = parseInt(arr[arr.length - 1].replace('.gif', ''));
      var name = '';
      for (i = 0; i < arr.length - 1; ++i) {
        if (i > 0) {
          name += '_';
        }
        name += arr[i];
      }
      name += '_';

    	res.render('gif/index', {
    	    title: 'Gif: ' + id,
    	    gif: id,
          previous : name + (num - 1) + '.gif',
          next :  name + (num + 1) + '.gif',
          results :  JSON.stringify(arr) + '<br/><br/>' + JSON.stringify(results)
    	});
    });
};