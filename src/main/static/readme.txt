This is the Hiram Pages Bridge, an open source GPL V3 project available from https://www.hirampages.com

There are two versions available:

* spa-aws-sdk/hp-bridge.html (~435 KB)
* static-only/hp-bridge.html (~220 KB)

The basic tradeoff is the "spa-aws-sdk" version has the default AWS JavaScript SDK and is about 2x the filesize
of the other "static-only" version. The "static-only" version has a custom build of the AWS JavaScript SDK that
only supports S3.

If you are hosting a static website like Octopress, Sigal, etc, and your site does not need the AWS SDK,
pick the "static-only" version.

If you are hosting a legacy single page application that needs the bridge but also needs the AWS SDK,
pick the "spa-aws-sdk" option and the AWS global will be available for your code (you don't need to include it again).