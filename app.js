var express = require('express'),
    routes = require('./routes'),
	fs = require('fs'),
	marked = require('marked');
	
var contentDirectory = './content/'

var app = module.exports = express.createServer();

app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
});

app.configure('production', function(){
  app.use(express.errorHandler()); 
});

// Routes
function getAllButLastPath(path) {
    var ix = path.lastIndexOf('/');
    return ix > 0 ? path.substring(0, ix) : '';
}

function locateAndRead(filename, path, continuation) {
	fs.readFile(contentDirectory + path + '/' + filename, 'utf8', function(err, data) {
		if (err) {
			if (err.code === 'ENOENT') {
				if (path === '') {
					continuation(null, null);
				}
				else {
                    console.log('File ' + contentDirectory + path + '/' + filename + ' does not exist');
					locateAndRead(filename, getAllButLastPath(path), continuation);
				}
			}
			else {
				continuation(err, null);
			}
		}
		else {
			continuation(null, data);
		}
	});
}

function lexer(str) {
    var wikiLinks = [];
    str = str.replace(/\[\[([^\n]*?)(?:\|([^\n]*?))?\]\]/, function(_, target, text) {
        text   = (text || target.substring(target.lastIndexOf('/') + 1)).trim();
        target = target.trim();
        return '(' + text + ', ' + target + ')';
        wikiLinks.push(target);
    });
    var result = marked.lexer(str);
    result.wikiLinks = wikiLinks;
    return result;
}

function renderPage(path, layout, content) {
    var tokens = lexer(content);
    var title = path;
    for (var i = 0; i < tokens.length; i++) {
         if (tokens[i].type === 'heading') {
             title = tokens[i].text;
             break;
         }
    }
    var renderedContent = marked.parser(tokens);
    var x = [];
    return layout.replace('{{body}}', renderedContent).replace('{{title}}', title);
}

app.get(/\/wiki\/(.+)/, function(req, res) {
	var path = req.params[0];
	fs.readFile(contentDirectory + path + '.md', 'utf8', function(err, content) {
		if (err) {
			if (err.code === 'ENOENT') {
				missingFile(res);
				return;
			}
			else {
				throw err;
			}
		}

		locateAndRead('_layout.html', getAllButLastPath(path), function(err, layout) {
			if (err) throw err;
            if (layout === null) throw 'Missing _layout.html';
            res.send(renderPage(path, layout, content));
		});
	});
});

function missingFile(res) {
	res.send('404!');
}

//app.get('/wiki/:path', routes.getWiki);

app.listen(3000);
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
