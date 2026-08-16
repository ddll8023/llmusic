const fs = require("node:fs")
const path = require("node:path")
const yaml = require("js-yaml")

const releaseDir = path.resolve(process.argv[2] || path.join(__dirname, "../../release"))
const expectedVersion = process.argv[3] ? process.argv[3].replace(/^v/, "") : null

function readYaml(fileName) {
	const filePath = path.join(releaseDir, fileName)
	if (!fs.existsSync(filePath)) {
		throw new Error(`Missing release metadata: ${fileName}`)
	}
	return {
		filePath,
		data: yaml.load(fs.readFileSync(filePath, "utf8")),
	}
}

function assertMetadata(fileName, metadata) {
	if (!metadata || typeof metadata !== "object") {
		throw new Error(`Invalid release metadata: ${fileName}`)
	}
	if (expectedVersion && metadata.version !== expectedVersion) {
		throw new Error(`${fileName} version ${metadata.version} does not match ${expectedVersion}`)
	}
	if (!Array.isArray(metadata.files) || metadata.files.length === 0) {
		throw new Error(`${fileName} has no update files`)
	}

	for (const file of metadata.files) {
		if (!file || typeof file.url !== "string") {
			throw new Error(`${fileName} contains an invalid file entry`)
		}
		if (!fs.existsSync(path.join(releaseDir, file.url))) {
			throw new Error(`${fileName} references missing asset: ${file.url}`)
		}
	}
}

function mergeMacMetadata() {
	const arm = readYaml("latest-mac-arm64.yml")
	const x64 = readYaml("latest-mac-x64.yml")
	assertMetadata("latest-mac-arm64.yml", arm.data)
	assertMetadata("latest-mac-x64.yml", x64.data)

	if (arm.data.version !== x64.data.version) {
		throw new Error("macOS update metadata versions do not match")
	}

	const files = [...arm.data.files, ...x64.data.files].filter(
		(file, index, all) => all.findIndex((candidate) => candidate.url === file.url) === index,
	)
	const merged = {
		...x64.data,
		files,
	}
	delete merged.path
	delete merged.sha512

	const outputPath = path.join(releaseDir, "latest-mac.yml")
	fs.writeFileSync(outputPath, yaml.dump(merged, { noRefs: true, lineWidth: -1 }), "utf8")
	fs.rmSync(arm.filePath)
	fs.rmSync(x64.filePath)
	return merged
}

const macMetadata = mergeMacMetadata()
const windowsMetadata = readYaml("latest.yml").data
assertMetadata("latest.yml", windowsMetadata)
assertMetadata("latest-mac.yml", macMetadata)

const macUrls = macMetadata.files.map((file) => file.url)
if (!macUrls.some((url) => url.includes("arm64")) || !macUrls.some((url) => url.includes("x64"))) {
	throw new Error("latest-mac.yml must contain both arm64 and x64 assets")
}

console.log(`Prepared update metadata for ${expectedVersion || macMetadata.version}`)
console.log(`Windows files: ${windowsMetadata.files.map((file) => file.url).join(", ")}`)
console.log(`macOS files: ${macUrls.join(", ")}`)
