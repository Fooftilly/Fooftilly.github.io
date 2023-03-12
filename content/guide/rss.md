---
title: "My RSS setup with Sfeed"
date: 2023-02-14
lastmod: 2023-02-27
tags: ["RSS", "Sfeed", "News", "YouTube"]
---

Although not widely utilized today by everyday people,
RSS is far from being useless.
In fact,
nearly every website has an RSS feed,
and platforms such as YouTube and Reddit even provide access to individual RSS feeds for channels or subreddits.
Personally,
I appreciate the fact that YouTube incorporates RSS,
even though it is not advertised and accessing it requires a few extra steps to export subscriptions to the RSS suitable format.

Although this setup is designed for Linux users,
it's possible to adapt it for Windows with some tweaking at your end.
If you had experience with RSS and Linux over the last few years,
you've likely heard that Newsboat is the go-to lightweight RSS reader.
While Newsboat is a reliable choice,
I personally believe that Sfeed is more versatile and superior.

Instruction on how to download Sfeed are available [here](https://codemadness.org/sfeed-simple-feed-parser.html).
If you just want to clone it you can use

```shell
git clone git://git.codemadness.org/sfeed
```

or if you use AUR helper you can download it with

```shell
yay -S sfeed
```

If you don't want to edit source files,
you should probably download Sfeed from AUR,
or use someting like `nix-shell` or `distrobox` if you are not or Arch-based distro.

## Setting up Sfeed

Since I want to keep my YouTube and news feeds separate,
I created a folder named `rss` in my home folder and add subfolders `news` and `youtube` into it.
Sfeed saves read items in a plain text file that can be specified.
To store read items separately for each feed,
I created `urls` and `urls-youtube` files within the `rss` folder.

Inside `news` and `youtube` folder you should create `sfeedrc` file.
This file stores configurations and list of feeds.
An example of minimal sfeedrc:

```bash
#sfeedpath="$HOME/.sfeed/feeds"

# list of feeds to fetch:
feeds() {
	# feed <name> <feedurl> [basesiteurl] [encoding]
	feed "Peroniko" "https://www.peroniko.xyz/index.xml"
}
```

Edit the `sfeedpath` variable to `$HOME/rss/news/feeds` in the `sfeedrc` file in the `news` folder, and in the `sfeedrc` file in the `youtube` folder, change `$HOME/.sfeed/feeds` to `$HOME/rss/youtube/feeds/`.

Sfeed allows flexible folder structure and save location. Edit the `sfeedpath` variable to the preferred path and remove the comment (#) to change to that location.
For more customization,
you should check out [Sfeed README file](https://codemadness.org/git/sfeed/file/README.html).

## News

It is very easy to find RSS feeds for news.
If the website has an RSS feed,
extension like
[Feed Preview for Firefox](https://addons.mozilla.org/en-US/firefox/addon/feed-preview/)
or
[RSS Extractor Userscript](https://cable.ayra.ch/tampermonkey/view.php?script=rss_extractor.user.js)
can help you find those RSS feeds.
When you have the feed link just copy it to the `sfeedrc` file,
as shown in the minimal example above.
Next time you update your RSS,
new feed should be available.

After you update your feeds,
you can use `sfeed_curses` to view those feeds.
Alternatively,
you could use [news-update](#news-update) script I have provided in the [Scripts](#useful-rss-scripts)

## YouTube

There are a few steps you need to do before you will be able to import YouTube subscriptions into Sfeed.
YouTube doesn't have an easy way to export subscriptions because they removed it.
Instead,
an userscript is now the easiest way to export your subscriptions to OMPL format.

First you would need to install userscript manager.
Tampermonkey is on of the most popular ones right now.
It is available on
[Firefox](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/)
and
[Chrome](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo).
There are guide for other browsers on
[Tampermonkey](https://www.tampermonkey.net/index.php)
website.

To export all YouTube subscriptions to OPML,
first install the
[Export YouTube Subscriptions to RSS OPML](https://greasyfork.org/en/scripts/418574-export-youtube-subscriptions-to-rss-opml)
userscript.
Then,
navigate to
[youtube.com/feed/channels](https://www.youtube.com/feed/channels)
and ensure all subscriptions are loaded by scrolling down to the end of the page.
Click on the Tampermonkey icon in the toolbar and select `Export YouTube Subscriptions to OPML`.
The script will ask you for the save location.
You could save this file anywhere.
If the option is not available,
refresh the page and scroll down again.
Note that the script may not load properly if you don't go to the
[youtube.com/feed/channels](https://www.youtube.com/feed/channels)
page directly.

Now that you have `youtubeSubscriptions.opml` you need to import it into Sfeed.
Sfeed has `sfeed_opml_command` that you could use to achieve this.
Simply do

```bash
sfeed_opml_import < path/to/youtubeSubscriptions.opml > "$HOME/rss/youtube/sfeedrc"
```

This option,
howerver,
doesn't preserve the `sfeedpath` we changed to non-default one.
Because of that,
you could use this script ([import_youtube](#import_youtube)) to preserve `sfeedpath` every time you update your subscriptions.

### import_youtube

```bash
#!/bin/sh

if [ -z "$1" ]; then
  echo "Please provide an argument file"
  exit 1
fi

if [ ! -f "$1" ]; then
  echo "File not found"
  exit 1
fi

sfeed_opml_import < "$1" > $HOME/rss/youtube/sfeedrc

# Fix path for youtube
sed -i '1s/^#sfeedpath=.*/sfeedpath="$HOME\/rss\/youtube\/feeds"/' $HOME/rss/youtube/sfeedrc
```

Just set up your path in the script and then you could export YouTube subscriptions without a need to change `sfeedpath` every time.
Simply run `import_youtube` in shell:

```bash
import_youtube "/path/to/youtubeSubscriptions.opml"
```

You could also add all your RSS script to global $PATH.

Now that you have imported your YouTube subscriptions,
you might want a way to update them.
You could manually update them with `sfeed_update`,
or you could use [youtube-update](#youtube-update) script I have provided in the [Scripts](#useful-rss-scripts)

## Useful RSS Scripts

Here is a list of useful scripts that for RSS.
If you want to use them,
create a folder scripts inside the rss folder.
Don't forget to make them executable with `chmod +x`
If they are not in path you would need to run them with `./` prefix (eg. ./news-update) from the folder they are in.
If you want them to be available globally,
you will need to add them to $PATH.

### news-update

Update news feeds and open sfeed_curses, show only unread.
You can remove `sfeed_update` if you don't want to update your feed when you launch this script,
or you can use Ctrl-C to interupt update and directly open `sfeed_curses` without updating.

```bash
#!/bin/sh

sfeed_update $HOME/rss/news/sfeedrc

export SFEED_AUTOCMD="t"
export SFEED_URL_FILE="$HOME/rss/urls"
[ -f "$SFEED_URL_FILE" ] || touch "$SFEED_URL_FILE"
sfeed_curses $HOME/rss/news/feeds/*
```

### youtube-update

Update YouTube feeds and open sfeed_curses, show only unwatched.
Same thing as in [news-update](#news-update) above,
you can remove `sfeed_update` if you don't want to update your feed when you launch this script,
or you can use Ctrl-C to interupt update and directly open `sfeed_curses` without updating.

```bash
#!/bin/sh

sfeed_update $HOME/rss/youtube/sfeedrc

export SFEED_AUTOCMD="t"
export SFEED_URL_FILE="$HOME/rss/urls-youtube"
[ -f "$SFEED_URL_FILE" ] || touch "$SFEED_URL_FILE"
sfeed_curses $HOME/rss/youtube/feeds/*
```

## Automatically update RSS

You could use this script to manually update RSS feeds.

### newsup

```bash
#!/bin/sh

while true; do
  # Check if we can ping Google's DNS server at 8.8.8.8
  if ping -c 3 -W 2 8.8.8.8 > /dev/null 2>&1; then
    # We have a connection, so update the RSS feeds
    /usr/bin/sfeed_update $HOME/rss/news/sfeedrc
    /usr/bin/sfeed_update $HOME/rss/youtube/sfeedrc

    /usr/bin/notify-send "📰 RSS feed update complete."
    /usr/bin/notify-send "$($HOME/rss/scripts/unread)"

    # Break out of the loop
    break
  else
    # We don't have a connection, so wait one minute before trying again
    /usr/bin/notify-send "Network connection unavailable. RSS update will be attempted again in 60 seconds."
    sleep 60
  fi
done
```

### unread

Count unread and send notification.

```bash
#!/bin/sh

# Count the unread and total items from news feeds using the URL file.
awk -F '\t' '
# URL file: amount of fields is 1.
NF == 1 {
  u[$0] = 1; # lookup table of URLs.
  next;
}
# feed file: check by URL or id.
{
  if(match($0,/news/)){
    total_news++;
    if (length($3)) {
      if (u[$3])
        read_news++;
    } else if (length($6)) {
      if (u[$6])
        read_news++;
    }
  }
}
END {
  print "News Unread: " (total_news - read_news);
  print "News Total:  " total_news;
}' $HOME/rss/urls $HOME/rss/news/feeds/*

# Count the unread and total items from youtube feeds using the URL file.
awk -F '\t' '
# URL file: amount of fields is 1.
NF == 1 {
  u[$0] = 1; # lookup table of URLs.
  next;
}
# feed file: check by URL or id.
{
  if(match($0,/youtube/)){
    total_youtube++;
    if (length($3)) {
      if (u[$3])
        read_youtube++;
    } else if (length($6)) {
      if (u[$6])
        read_youtube++;
    }
  }
}
END {
  print "Youtube Unwatched: " (total_youtube - read_youtube);
  print "Youtube Total:  " total_youtube;
}' $HOME/rss/urls-youtube $HOME/rss/youtube/feeds/*
```

### runner.py

You can use this script to run the `newsup` script at the top of every hour automatically.
To do so,
add `runner.py` to something that will run it at startup,
such as a cronjob.

```python
#!/usr/bin/python

import time
import subprocess

while True:
    # Get current minute
    current_minute = time.strftime("%M")

    # Check if it's the top of the hour
    if current_minute == "00":
        # Run newsup
        subprocess.run(["$HOME/rss/scripts/newsup"])

    # Sleep for 60 seconds
    time.sleep(60)
```
