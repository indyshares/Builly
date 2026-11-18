# Source Export & Download

## 1. Product decision

HTML/CSS/JS source code is not required for a published Builly site to run. Published sites use the shared Runtime and published JSON configuration.

Source code is generated only when the owner explicitly requests Export/Download.

## 2. Export output

Example downloadable package:

```text
my-portfolio-source.zip
├── README.md
├── index.html
├── pages/
│   ├── about.html
│   └── contact.html
├── components/
├── styles/
│   ├── reset.css
│   ├── variables.css
│   ├── global.css
│   └── pages/
├── scripts/
│   ├── main.js
│   └── modules/
├── assets/
│   ├── images/
│   ├── icons/
│   └── fonts/
└── export-manifest.json
```

This is a portable export format. It may use a static rendering/export adapter that translates the published configuration and data into standalone files. It is not the runtime architecture.

## 3. Export scope and limits

- Export only the selected site and assets the owner is authorized to access.
- Offer clear export options if static export cannot reproduce dynamic CMS/forms exactly.
- Do not export secrets, OAuth tokens, private Inbox data or internal notes.
- CMS content export should include only public/published content unless owner explicitly selects drafts and has permission.
- Forms may be exported as a compatible endpoint integration or documented placeholder; never embed private destination IDs or credentials.
- State clearly which features require Builly Runtime and which are portable standalone output.

## 4. Generation lifecycle

1. Owner clicks Export Source.
2. Backend resolves selected site and current chosen version.
3. Validate permissions and export scope.
4. Generate source files in temporary workspace or Drive export staging.
5. Include assets and manifest.
6. Validate references and archive.
7. Provide download.
8. Expire temporary export artifact according to retention policy.

If export files are stored temporarily in Drive, place them under `Builly/Sites/{site}/Exports/` and clean up under an explicit retention policy. The canonical website is not this export folder.

## 5. Naming and versioning

Include:
- site slug
- publish version
- export timestamp
- export format version

Example: `my-portfolio-build_0007-source.zip`
