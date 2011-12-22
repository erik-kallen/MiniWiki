var express = require('express'),
    routes = require('./routes'),
	fs = require('fs'),
	marked = require('marked');
	
var contentDirectory = './content/'
var wikiDirectory = 'wiki'

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

function canonicalizePath(path, base) {
    var parts = path.split('/'), result = ((base.length === 0 || path.charAt(0) === '/') ? [] : base.split('/').slice(0));
    parts.forEach(function(p) {
        if (p === '' || p === '.') {
            // do nothing
        }
        else if (p === '..') {
            if (result.length > 0)
                result.pop();
        }
        else {
            result.push(p);
        }
    });
    return result.join('/');
}

/*
To be put in a test file somewhere
console.log(canonicalizePath('below', 'some/path/somewhere')); // some/path/somewhere/below
console.log(canonicalizePath('below/further', 'some/path/somewhere')); // some/path/somewhere/below/further
console.log(canonicalizePath('..', 'some/path/somewhere')); // some/path
console.log(canonicalizePath('below/../../further', 'some/path/somewhere')); // some/path/further
console.log(canonicalizePath('below/../../further/', 'some/path/somewhere')); // some/path/further
console.log(canonicalizePath('/another/path/', 'some/path/somewhere')); // another/path/
console.log(canonicalizePath('double//slash', 'some/path/somewhere')); // another/path/somewhere/double/slash
console.log(canonicalizePath('../../../../../../', 'some/path/somewhere')); // (empty)
console.log(canonicalizePath('../../../../../../something', 'some/path/somewhere')); // something
console.log(canonicalizePath('', 'some/path/somewhere')); // another/path/somewhere
console.log(canonicalizePath('some/path', '')); // some/path

console.log(fixWikiLinks('this is some [[link]] text.', 'some/path')); // { wikiLinks: [ 'some/path/link' ], str: 'this is some [link](/wiki/some/path/link) text.' }
console.log(fixWikiLinks('this is some [[nested/link]] text.', 'some/path')); // { wikiLinks: [ 'some/path/nested/link' ], str: 'this is some [link](/wiki/some/path/nested/link) text.' }
console.log(fixWikiLinks('this is some [[../link]] text.', 'some/path')); // { wikiLinks: [ 'some/link' ], str: 'this is some [link](/wiki/some/link) text.' }
console.log(fixWikiLinks('this is some [[/something/link]] text.', 'some/path')); // { wikiLinks: [ 'something/link' ], str: 'this is some [link](/wiki/something/link) text.' }
console.log(fixWikiLinks('this is some [[ nested/link | Other text ]] text.', 'some/path')); // { wikiLinks: [ 'wiki/some/path/nested/link' ], str: 'this is some [Other text](/something/link) text.' }
 */


function fixWikiLinks(str, basePath) {
    var wikiLinks = [];
    str = str.replace(/\[\[([^\n]*?)(?:\|([^\n]*?))?\]\]/, function(_, target, text) {
        text   = (text || target.substring(target.lastIndexOf('/') + 1)).trim();
        target = canonicalizePath(target.trim(), basePath);
        wikiLinks.push(target);
        return '[' + text + '](/' + wikiDirectory + '/' + target + ')';
    });

    return { wikiLinks: wikiLinks, str: str };
}

function lexer(str, basePath) {
    var fixed = fixWikiLinks(str, basePath);
    var result = marked.lexer(fixed.str);
    result.wikiLinks = fixed.wikiLinks;
    return result;
}

function renderPage(path, layout, content) {
    var tokens = lexer(content, getAllButLastPath(path));
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

app.get(/\/' + wikiDirectory + '\/(.+)/, function(req, res) {
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

app.listen(3000);
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
