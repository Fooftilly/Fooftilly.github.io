---
title: "How to Download Latest Release of a Package from Gitlab"
date: 2023-02-16
lastmod: 2023-02-16
tags: ["Git", "Gitlab", "GitHub"]
---

Gitlab currently lacks a convenient option to download the most recent package from a repository,
in contrast to Github.
Consequently,
one may require a script to obtain the latest package.

Here is the simple script that download latest package.
{{< gist Fooftilly 3e10ab9f1211ea6ba3f272c070314850 >}}

To execute this script successfully,
it is necessary to customize `<GITLAB_PROJECT_ID>` and `<GITLAB_PROJECT_RELEASE_FILE>`.
The `<GITLAB_PROJECT_ID>` can be found by examining the page source of Gitlab repository and searching for:

```html
<input type="hidden" name="project_id" id="project_id" value= />
```

To fill in the `<GITLAB_PROJECT_ID>` field in the script,
copy the number from the value field.
To identify `<GITLAB_PROJECT_RELEASE_FILE>`,
navigate to the release page of the repository and look for the pattern that each release follows.
For instance,
if each release contains a number,
copy the initial part of that file,
excluding the number.
In such a scenario,
if the file is named something like `project-release-1.3.5`,
`<GITLAB_PROJECT_RELEASE_FILE>` should be substituted with `project-release-`.
The script will download only the first file with that specific pattern that it discovers.
