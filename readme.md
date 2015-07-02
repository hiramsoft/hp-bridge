Hiram Pages Bridge
===============

This project builds hp-bridge.html, which is used to bridge existing static websites with [Hiram Pages](https://www.hirampages.com).

The basic premise of the project is to bridge a static site with the constraints of a locked-down Hiram Pages bucket.

Tested projects
------

The Hiram Pages Bridge has been tested with the following demo projects:

1. [Sigal Gallery](https://github.com/hiramsoft/hp-demo-sigal)
2. [Octopress (and Jekyll) blog](https://github.com/hiramsoft/hp-demo-octopress)
3. [Twitter Bootstrap Documentation](https://github.com/hiramsoft/hp-demo-twbs)
4. [Zurb Foundation Documentation](https://github.com/hiramsoft/hp-demo-foundation)

Developing
------

1. > npm install
2. > gulp dist
3. Check out *dist* for hp-bridge.html

This environment is based on [https://github.com/hiramsoft/es6-ng-twbs-gulp-start](https://github.com/hiramsoft/es6-ng-twbs-gulp-start)
with two key differences:

* No JSPM
* No AngularJS

Why? This project has to use as few dependencies as possible since I am conscious about the filesize.
Most of the filesize is based on the AWS SDK, but why double the file if we don't have to?
 
One consequence is that I've taken the approach of keeping everything in one file.
This isn't the most glamerous, and I may eventually split the contents up, but for now birdge.js is the whole shebang.

License
-------

GPL V3