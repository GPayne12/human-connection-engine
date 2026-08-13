// ocr.swift — turn a screen recording (or screenshots) of a LinkedIn
// connections list into a CSV the HCE triage view can read.
//
// Uses only Apple frameworks: AVFoundation decodes the video, Vision does the
// text recognition. No ffmpeg, no Python, no installs.
//
// Output is deliberately in LinkedIn's OWN export column format, so the
// existing, tested importer (src/db/linkedin.ts) parses it with no new code
// path — the same dedupe, skip-existing, and origin-story rules apply.
//
// OCR is imperfect by nature. That is fine here: every row goes through the
// swipe triage before it can reach the graph, so garbage gets discarded by
// hand rather than needing to be prevented.

import Foundation
import Vision
import AVFoundation
import CoreImage
import CoreGraphics
import ImageIO

// ── CLI ──────────────────────────────────────────────────────────────────

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data("error: \(message)\n".utf8))
    exit(1)
}

func log(_ message: String) {
    FileHandle.standardError.write(Data("\(message)\n".utf8))
}

let args = Array(CommandLine.arguments.dropFirst())
guard !args.isEmpty else {
    print("""
    usage: screen-ocr <recording.mov | screenshot.png | folder> [options]

      -o, --output <file.csv>   where to write (default: ./connections-ocr.csv)
          --fps <n>             frames sampled per second of video (default: 2)
          --raw <file.txt>      also dump the raw OCR lines, for debugging
          --min-sightings <n>   drop anyone seen in fewer than n frames (default: 1).
                                2 clears most motion-blur debris, at the cost of
                                a few real people caught in only one frame.

    A .txt raw dump can be passed back in as the input, which re-parses it
    without re-reading the video.
    """)
    exit(0)
}

var inputPath: String?
var outputPath = "connections-ocr.csv"
var fps = 2.0
var rawPath: String?
// Defaults to keeping everything. Raising this removes debris but also drops
// real people who happened to be caught in a single frame, and a junk row
// costs one swipe whereas a missing person cannot be swiped back in.
var minSightings = 1

var argIndex = 0
while argIndex < args.count {
    switch args[argIndex] {
    case "-o", "--output":
        argIndex += 1
        guard argIndex < args.count else { fail("--output needs a path") }
        outputPath = args[argIndex]
    case "--fps":
        argIndex += 1
        guard argIndex < args.count, let v = Double(args[argIndex]), v > 0 else {
            fail("--fps needs a positive number")
        }
        fps = v
    case "--raw":
        argIndex += 1
        guard argIndex < args.count else { fail("--raw needs a path") }
        rawPath = args[argIndex]
    case "--min-sightings":
        argIndex += 1
        guard argIndex < args.count, let v = Int(args[argIndex]), v >= 1 else {
            fail("--min-sightings needs a whole number of 1 or more")
        }
        minSightings = v
    default:
        if inputPath == nil { inputPath = args[argIndex] } else {
            fail("unexpected argument: \(args[argIndex])")
        }
    }
    argIndex += 1
}

guard let inputPath else { fail("no input file given") }
let inputURL = URL(fileURLWithPath: (inputPath as NSString).expandingTildeInPath)

// ── Text recognition ─────────────────────────────────────────────────────

/// Recognized text for one frame, ordered the way a person reads it.
func recognizeLines(_ handler: VNImageRequestHandler) -> [String] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    // Language correction "fixes" surnames into dictionary words. Off.
    request.usesLanguageCorrection = false

    guard (try? handler.perform([request])) != nil,
          let observations = request.results else { return [] }

    // Vision returns observations unordered. Bucket by vertical position
    // (origin is bottom-left, so higher minY means higher on screen), then
    // read left-to-right within a row.
    return observations
        .sorted { a, b in
            let ay = (a.boundingBox.minY * 200).rounded()
            let by = (b.boundingBox.minY * 200).rounded()
            if ay != by { return ay > by }
            return a.boundingBox.minX < b.boundingBox.minX
        }
        .compactMap { $0.topCandidates(1).first?.string }
}

// ── Parsing ──────────────────────────────────────────────────────────────

// LinkedIn renders each connection as roughly:
//     <name>
//     Message                (the button — it sits BETWEEN name and headline)
//     <headline>             (can wrap onto more than one line)
//     Connected on <date>
// "Connected on" is the only reliable delimiter, so it alone brackets an
// entry. The button is stripped as noise rather than treated as a boundary:
// treating it as one discards the name, which is the line above it.
//
// Parsing happens per frame, never across frames: a scroll cuts entries in
// half at the frame edge, and carrying a half-entry into the next frame glues
// one person's headline onto the next person's name.

let connectedOn = try! NSRegularExpression(pattern: "^connected on\\b", options: .caseInsensitive)
let degreeBadge = try! NSRegularExpression(pattern: "^[•·]?\\s*\\d(st|nd|rd|th)\\b", options: .caseInsensitive)
// Vision often merges the button into a neighbouring line ("..• Message ) Head
// of Design"), so the token has to be removed from inside a line, not just
// matched against a whole one.
let buttonTokens = try! NSRegularExpression(
    pattern: "\\b(message|connect|following|pending)\\b", options: .caseInsensitive)

let chrome: Set<String> = [
    "my network", "connections", "search", "sort by:", "recently added", "follow",
]
let decoration = CharacterSet(charactersIn: " .,•·()[]{}'\"|-–—…‧∙")

/// Words that are common in job headlines and essentially never surnames.
/// Deliberately excludes occupational surnames — Baker, Taylor, Miller,
/// Marshall, Carpenter, Fisher, Hunter, Walker, Cook and friends are real
/// people in this list.
let occupational: Set<String> = [
    "manager", "director", "professor", "assistant", "analyst", "engineer",
    "consultant", "founder", "specialist", "coordinator", "officer", "president",
    "designer", "developer", "advocate", "educator", "trainer", "administrator",
    "architect", "enablement", "strategist", "executive", "supervisor",
    "recruiter", "therapist", "instructor", "researcher", "scientist",
    "technician", "associate", "intern", "freelance", "student", "graduate",
    "candidate", "professional", "enthusiast", "advisor", "counselor",
    "producer", "attorney", "nurse", "physician", "pharmacist", "accountant",
    "auditor", "ambassador", "representative", "realtor", "entrepreneur",
    "marketing", "sales", "operations", "logistics", "finance", "recruiting",
    "seeking", "experienced", "aspiring", "certified", "licensed", "senior",
    "junior", "ceo", "cto", "coo", "cfo", "vp", "mba", "phd",
]

func isAnchor(_ line: String) -> Bool {
    let range = NSRange(line.startIndex..., in: line)
    return connectedOn.firstMatch(in: line, range: range) != nil
}

/// Strips the button text and the surrounding punctuation Vision picks up from
/// the UI, leaving the human-written part of the line.
func clean(_ raw: String) -> String {
    let range = NSRange(raw.startIndex..., in: raw)
    let stripped = buttonTokens.stringByReplacingMatches(
        in: raw, range: range, withTemplate: " ")
    return stripped
        .trimmingCharacters(in: decoration)
        .split(separator: " ")
        .joined(separator: " ")
}

func isNoise(_ line: String) -> Bool {
    if line.isEmpty { return true }
    if chrome.contains(line.lowercased()) { return true }
    let range = NSRange(line.startIndex..., in: line)
    if degreeBadge.firstMatch(in: line, range: range) != nil { return true }
    // Bare punctuation or single characters are always list chrome.
    if line.count <= 2 { return true }
    return false
}

/// Rejects the debris a scrolling capture produces: half-rendered text at the
/// frame edge, and — the common one — a headline promoted into the name slot
/// because the name above it had already scrolled out of shot.
func isPlausibleName(_ raw: String) -> Bool {
    let name = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard name.count >= 3, name.count <= 60 else { return false }
    guard name.rangeOfCharacter(from: .decimalDigits) == nil else { return false }
    for bad in ["/", "@", ":", "|", "&", ". "] where name.contains(bad) { return false }
    if name.hasSuffix(".") { return false }
    let words = name.split(separator: " ")
    guard words.count >= 2, words.count <= 5 else { return false }
    // Case is not a signal: plenty of people write their own name lower-case.
    for word in words {
        let bare = word.lowercased().trimmingCharacters(in: decoration)
        if occupational.contains(bare) { return false }
    }
    return true
}

struct Candidate {
    var name: String
    var title: String
}

func parseEntries(from lines: [String]) -> [Candidate] {
    var found: [Candidate] = []
    var pending: [String] = []

    for line in lines {
        if isAnchor(line) {
            // Cap at four lines: a name plus a headline that wrapped. Anything
            // longer means debris crept in, and the tail is the real entry.
            let parts = Array(pending.suffix(4))
            if let name = parts.first, isPlausibleName(name) {
                found.append(Candidate(
                    name: name,
                    title: parts.dropFirst().joined(separator: " ")))
            }
            pending = []
        } else {
            let cleaned = clean(line)
            if !isNoise(cleaned) { pending.append(cleaned) }
        }
    }
    return found
}

// ── Frame streaming ──────────────────────────────────────────────────────

/// Runs an async call from this synchronous script. Safe here because none of
/// the AVFoundation work below is main-actor bound.
func syncAwait<T>(_ operation: @escaping () async throws -> T) throws -> T {
    let semaphore = DispatchSemaphore(value: 0)
    var outcome: Result<T, Error>?
    Task.detached {
        do { outcome = .success(try await operation()) }
        catch { outcome = .failure(error) }
        semaphore.signal()
    }
    semaphore.wait()
    return try outcome!.get()
}

var observations: [Candidate] = []
var rawLines: [String] = []
var framesRead = 0

// Frames are delimited in the raw dump so a dump can be fed straight back in,
// which makes tuning the parser a second's work instead of a full re-read of
// the video.
let frameMarkerPrefix = "--- frame"

/// OCRs one frame and folds its entries into the running totals. Frames are
/// handled as they arrive and then released — a ten-minute recording holds
/// well over a thousand samples, which is gigabytes if they are all kept.
func processLines(_ lines: [String], estimate: Int, echoRaw: Bool = true) {
    framesRead += 1
    if rawPath != nil && echoRaw {
        rawLines.append(frameMarkerPrefix + " \(framesRead) ---")
        rawLines.append(contentsOf: lines)
    }
    observations.append(contentsOf: parseEntries(from: lines))
    if framesRead % 25 == 0 {
        let suffix = estimate > 0 ? "/\(estimate)" : ""
        log("  frame \(framesRead)\(suffix) — \(observations.count) entries so far")
    }
}

func handleFrame(_ handler: VNImageRequestHandler, estimate: Int) {
    processLines(recognizeLines(handler), estimate: estimate)
}

let imageExtensions: Set<String> = ["png", "jpg", "jpeg", "heic", "tiff", "gif"]

func loadImage(_ url: URL) -> CGImage? {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
    return CGImageSourceCreateImageAtIndex(source, 0, nil)
}

/// Decodes the video once, front to back, taking a frame every `1/fps`
/// seconds. Seeking to each sample instead would force a decode from the
/// nearest keyframe every time — minutes of work on a long recording.
func streamVideo(_ url: URL, fps: Double) {
    let asset = AVURLAsset(url: url)

    guard let track = (try? syncAwait({
        try await asset.loadTracks(withMediaType: .video)
    }))?.first else {
        fail("no video track in \(url.lastPathComponent)")
    }
    let duration = (try? syncAwait({ try await asset.load(.duration) })) ?? .zero
    let seconds = CMTimeGetSeconds(duration)
    let estimate = seconds.isFinite && seconds > 0 ? Int(seconds * fps) : 0
    if estimate > 0 {
        log("reading ~\(estimate) frames from \(Int(seconds))s of video…")
    }

    guard let reader = try? AVAssetReader(asset: asset) else {
        fail("could not open \(url.lastPathComponent)")
    }
    let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    ])
    output.alwaysCopiesSampleData = false
    reader.add(output)
    reader.startReading()

    let step = 1.0 / fps
    var nextSampleAt = 0.0

    while let sample = output.copyNextSampleBuffer() {
        let t = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sample))
        if t + 1e-6 >= nextSampleAt, let pixels = CMSampleBufferGetImageBuffer(sample) {
            // Vision reads the pixel buffer directly — no CGImage conversion.
            handleFrame(VNImageRequestHandler(cvPixelBuffer: pixels, options: [:]),
                        estimate: estimate)
            nextSampleAt += step
        }
    }

    if reader.status == .failed {
        fail("decoding stopped: \(reader.error?.localizedDescription ?? "unknown")")
    }
}

var isDirectory: ObjCBool = false
FileManager.default.fileExists(atPath: inputURL.path, isDirectory: &isDirectory)

if isDirectory.boolValue {
    let contents = (try? FileManager.default.contentsOfDirectory(at: inputURL, includingPropertiesForKeys: nil)) ?? []
    let imageFiles = contents
        .filter { imageExtensions.contains($0.pathExtension.lowercased()) }
        .sorted { $0.lastPathComponent < $1.lastPathComponent }
    guard !imageFiles.isEmpty else { fail("no images found in \(inputURL.path)") }
    log("reading \(imageFiles.count) image(s)…")
    for file in imageFiles {
        guard let image = loadImage(file) else { continue }
        handleFrame(VNImageRequestHandler(cgImage: image, options: [:]), estimate: imageFiles.count)
    }
} else if inputURL.pathExtension.lowercased() == "txt" {
    // Re-parse a previous --raw dump. No OCR, so parser changes can be tried
    // against a real recording without re-reading it.
    guard let text = try? String(contentsOf: inputURL, encoding: .utf8) else {
        fail("could not read \(inputURL.path)")
    }
    var blocks: [[String]] = []
    for line in text.components(separatedBy: "\n") {
        if line.hasPrefix(frameMarkerPrefix) { blocks.append([]) }
        else if !blocks.isEmpty { blocks[blocks.count - 1].append(line) }
    }
    guard !blocks.isEmpty else {
        fail("\(inputURL.lastPathComponent) has no \"\(frameMarkerPrefix) N ---\" markers — is it a --raw dump?")
    }
    log("re-parsing \(blocks.count) frame(s) from a raw dump…")
    for block in blocks { processLines(block, estimate: blocks.count, echoRaw: false) }
} else if imageExtensions.contains(inputURL.pathExtension.lowercased()) {
    guard let image = loadImage(inputURL) else { fail("could not read \(inputURL.path)") }
    log("reading 1 image…")
    handleFrame(VNImageRequestHandler(cgImage: image, options: [:]), estimate: 1)
} else {
    streamVideo(inputURL, fps: fps)
}

guard framesRead > 0 else { fail("no frames could be read from \(inputURL.path)") }

if let rawPath {
    try? rawLines.joined(separator: "\n").write(
        toFile: (rawPath as NSString).expandingTildeInPath, atomically: true, encoding: .utf8)
}

if observations.isEmpty {
    log("""

    No entries could be paired up. Re-run with --raw /tmp/ocr.txt to see what
    the OCR actually read, and check the recording covers the connections list
    itself — each row needs its "Connected on <date>" line visible.
    """)
}

// ── Reconcile ────────────────────────────────────────────────────────────

func normalize(_ s: String) -> String {
    s.lowercased().split(whereSeparator: { $0 == " " }).joined(separator: " ")
}

/// Levenshtein, abandoned once it passes `limit` — OCR variants of one name
/// differ by a character or two ("Priya" read as "Priva"), so anything further
/// apart is a different person.
func withinEditDistance(_ a: String, _ b: String, limit: Int) -> Bool {
    if abs(a.count - b.count) > limit { return false }
    let x = Array(a), y = Array(b)
    if x.isEmpty || y.isEmpty { return max(x.count, y.count) <= limit }
    var previous = Array(0...y.count)
    for i in 1...x.count {
        var current = [i] + Array(repeating: 0, count: y.count)
        for j in 1...y.count {
            current[j] = x[i - 1] == y[j - 1]
                ? previous[j - 1]
                : min(previous[j - 1], previous[j], current[j - 1]) + 1
        }
        if current.min()! > limit { return false }
        previous = current
    }
    return previous[y.count] <= limit
}

func mostCommon(_ values: [String]) -> String {
    var counts: [String: Int] = [:]
    for value in values { counts[value, default: 0] += 1 }
    // Ties go to the longer string: a clipped headline loses to a full one.
    return counts.max { a, b in
        a.value != b.value ? a.value < b.value : a.key.count < b.key.count
    }?.key ?? ""
}

// `key` is only ever used for matching. Observed spellings stay in `names`,
// so the vote below is between things the OCR actually read, never against a
// lower-cased key that would win ties and destroy the capitalisation.
var groups: [(key: String, names: [String], titles: [String])] = []

let byFrequency = observations
    .reduce(into: [String: Int]()) { $0[normalize($1.name), default: 0] += 1 }
    .sorted { $0.value != $1.value ? $0.value > $1.value : $0.key < $1.key }
    .map(\.key)

var groupIndexForKey: [String: Int] = [:]
for key in byFrequency {
    // Most-frequent spellings are seeded first, so rarer misreads attach to
    // them instead of the other way round.
    if let match = groups.indices.first(where: {
        withinEditDistance(groups[$0].key, key, limit: 2)
    }) {
        groupIndexForKey[key] = match
    } else {
        groups.append((key: key, names: [], titles: []))
        groupIndexForKey[key] = groups.count - 1
    }
}

for observation in observations {
    guard let index = groupIndexForKey[normalize(observation.name)] else { continue }
    groups[index].names.append(observation.name)
    if !observation.title.isEmpty { groups[index].titles.append(observation.title) }
}

// A real person stays on screen for seconds and so lands in many frames. The
// debris a scroll produces — smeared text from a frame caught mid-motion —
// reads differently every time, so it turns up once and never again. Sighting
// count separates the two more reliably than any spelling heuristic.
var resolved: [Candidate] = groups.compactMap { group in
    guard group.names.count >= minSightings else { return nil }
    let name = mostCommon(group.names.filter { !$0.isEmpty })
    guard !name.isEmpty else { return nil }
    return Candidate(name: name, title: mostCommon(group.titles))
}

// A frame that catches a headline after its name has scrolled off produces an
// entry whose "name" is really somebody's job title. Those show up verbatim as
// another entry's headline, which is enough to identify and drop them.
let knownTitles = Set(resolved.map { normalize($0.title) }.filter { !$0.isEmpty })
resolved = resolved.filter { !knownTitles.contains(normalize($0.name)) }
resolved.sort { $0.name.lowercased() < $1.name.lowercased() }

// ── Write CSV ────────────────────────────────────────────────────────────

func csvEscape(_ field: String) -> String {
    if field.contains(",") || field.contains("\"") || field.contains("\n") {
        return "\"" + field.replacingOccurrences(of: "\"", with: "\"\"") + "\""
    }
    return field
}

// LinkedIn's own export header, so src/db/linkedin.ts reads this unchanged.
var rows = ["First Name,Last Name,URL,Email Address,Company,Position,Connected On"]
for candidate in resolved {
    let words = candidate.name.split(separator: " ").map(String.init)
    let first = words.first ?? candidate.name
    let last = words.dropFirst().joined(separator: " ")
    // Company is left empty on purpose: splitting a headline on " at " guesses
    // wrong often enough that it would put invented employers in the graph.
    rows.append([
        csvEscape(first), csvEscape(last), "", "", "",
        csvEscape(candidate.title), "",
    ].joined(separator: ","))
}

let outURL = URL(fileURLWithPath: (outputPath as NSString).expandingTildeInPath)
try rows.joined(separator: "\n").appending("\n").write(to: outURL, atomically: true, encoding: .utf8)

print("\(resolved.count) people from \(framesRead) frames → \(outURL.path)")
print("review the CSV before importing — OCR guesses, and the triage swipe is the filter")
