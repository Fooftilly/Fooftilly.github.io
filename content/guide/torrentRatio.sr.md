---
title: "Kalkulator za torent ratio"
date: 2023-02-26
lastmod: 2023-02-26
tags: ["Torent", "Ratio","Kalkulator"]
translationKey: "torrentRatio"
---

## Ratio kalkulator

{{< ratio-calculator >}}

## Sh skripta za izračunavanje ratio-a

Ovo je mala skripta pomoću koje možete izračunati ratio vaših torenta, pojedinačno ili za sve.
{{< gist Fooftilly e6c3e1d3871526961229e4da9ae71d1a >}}

Takođe,
ako koristite qBittorrent,
evo skripte koja ažurira vaše statistike svakih 15 minuta.
Može ih ažurirati samo svakih 15 minuta zato što qBittorrent ne upisuje statistiku u fajl `qBittorrent-data.conf` odmah,
već samo svakih 15 minuta ili kada izađete iz aplikacije.

{{< gist Fooftilly e9bb53f2db78c8d26bb805d8db5f94a5 >}}
