---
title: "Simple Torrent Ratio Calculator"
date: 2023-02-26
lastmod: 2023-02-26
tags: ["Torrent", "Ratio","Calculator"]
---

## Online Ratio Calculator

{{< ratio-calculator >}}

## Script to Calculate Ratio

Here is a small script that can calculate the ratio for your torrents, globally or individually.
{{< gist Fooftilly e6c3e1d3871526961229e4da9ae71d1a >}}

Also,
if you are using qBittorrent,
here's the script that updates your stats every 15 minutes.
It can only update them every 15 minutes because qBittorrent dosen't write those stats to the `qBittorrent-data.conf` file right away,
but only every 15 minutes or when you exit the app.

{{< gist Fooftilly e9bb53f2db78c8d26bb805d8db5f94a5 >}}
