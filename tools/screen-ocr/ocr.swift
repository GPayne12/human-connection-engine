// ocr.swift — turn a screen recording (or screenshots) of a LinkedIn
// connections list into a CSV the HCE triage view can read.
//
// Uses only Apple frameworks: AVFoundation samples frames out of the video,
// Vision does the text recognition. No ffmpeg, no Python, no installs.
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
import CoreGraphics
import ImageIO

// ── CLI ──────────────────────────────────────────────────────────────────

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data("error: \(message)\n".utf8))
    exit(1)
}

let args = Array(CommandLine.arguments.dropFirst())
guard !args.isEmpty else {
    print("""
    usage: screen-ocr <recording.mov | screenshot.png | folder> [options]

      -o, --output <file.csv>   where to write (default: ./connections-ocr.csv)
          --fps <n>             frames sampled per second of video (default: 2)
          --raw <file.txt>      also dump the raw OCR lines, for debugging
    """)
    exit(0)
}

var inputPath: String?
var outputPath = "connections-ocr.csv"
var fps = 2.0
var rawPath: String?

var i = 0
while i < args.count {
    switch args[i] {
    case "-o", "--output":
        i += 1
        guard i < args.count else { fail("--output needs a path") }
        outputPath = args[i]
    case "--fps":
        i += 1
        guard i < args.count, let v = Double(args[i]), v > 0 else {
            fail("--fps needs a positive number")
        }
        fps = v
    case "--raw":
        i += 1
        guard i < args.count else { fail("--raw needs a path") }
        rawPath = args[i]
    default:
        if inputPath == nil { inputPath = args[i] } else { fail("unexpected argument: \(args[i])") }
    }
    i += 1
}

guard let inputPath else { fail("no input file given") }
let inputURL = URL(fileURLWithPath: (inputPath as NSString).expandingTildeInPath)

// ── Gather frames ────────────────────────────────────────────────────────

let imageExtensions: Set<String> = ["png", "jpg", "jpeg", "heic", "tiff", "gif"]

func loadImage(_ url: URL) -> CGImage? {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
    return CGImageSourceCreateImageAtIndex(source, 0, nil)
}

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

func framesFromVideo(_ url: URL, fps: Double) -> [CGImage] {
    let asset = AVURLAsset(url: url)
    let generator = AVAssetImageGenerator(asset: asset)
    generator.appliesPreferredTrackTransform = true
    // Zero tolerance: we want the frame at the moment asked for, because
    // consecutive samples that collapse onto the same frame waste OCR time.
    generator.requestedTimeToleranceBefore = .zero
    generator.requestedTimeToleranceAfter = .zero

    guard let duration = try? syncAwait({ try await asset.load(.duration) }) else {
        fail("could not read \(url.lastPathComponent) — is it a video?")
    }
    let seconds = CMTimeGetSeconds(duration)
    guard seconds.isFinite, seconds > 0 else {
        fail("could not read a duration from \(url.lastPathComponent) — is it a video?")
    }

    var images: [CGImage] = []
    let step = 1.0 / fps
    var t = 0.0
    while t < seconds {
        let time = CMTime(seconds: t, preferredTimescale: 600)
        if let image = try? syncAwait({ try await generator.image(at: time).image }) {
            images.append(image)
        }
        t += step
    }
    return images
}

var frames: [CGImage] = []
var isDirectory: ObjCBool = false
FileManager.default.fileExists(atPath: inputURL.path, isDirectory: &isDirectory)

if isDirectory.boolValue {
    let contents = (try? FileManager.default.contentsOfDirectory(at: inputURL, includingPropertiesForKeys: nil)) ?? []
    let imageFiles = contents
        .filter { imageExtensions.contains($0.pathExtension.lowercased()) }
        .sorted { $0.lastPathComponent < $1.lastPathComponent }
    guard !imageFiles.isEmpty else { fail("no images found in \(inputURL.path)") }
    frames = imageFiles.compactMap(loadImage)
} else if imageExtensions.contains(inputURL.pathExtension.lowercased()) {
    guard let image = loadImage(inputURL) else { fail("could not read \(inputURL.path)") }
    frames = [image]
} else {
    frames = framesFromVideo(inputURL, fps: fps)
}

guard !frames.isEmpty else { fail("no frames to read") }
FileHandle.standardError.write(Data("reading \(frames.count) frame(s)…\n".utf8))

// ── OCR ──────────────────────────────────────────────────────────────────

/// Recognized text for one frame, ordered the way a person reads it.
func recognizeLines(in image: CGImage) -> [String] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    // Language correction "fixes" surnames into dictionary words. Off.
    request.usesLanguageCorrection = false

    let handler = VNImageRequestHandler(cgImage: image, options: [:])
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

// ── Parse ────────────────────────────────────────────────────────────────

// LinkedIn renders each connection as roughly:
//     <name>
//     <headline>            (can wrap onto more than one line)
//     Connected on <date>
//     Message
// "Connected on" anchors the end of an entry and "Message" ends the row, so
// the two together bracket exactly one person. Parsing happens per frame,
// never across frames: a scroll cuts entries in half at the frame edge, and
// carrying a half-entry into the next frame glues one person's headline onto
// the next person's name.

let connectedOn = try! NSRegularExpression(pattern: "^connected on\\b", options: .caseInsensitive)
let degreeBadge = try! NSRegularExpression(pattern: "^[•·]?\\s*\\d(st|nd|rd|th)\\b", options: .caseInsensitive)

let chrome: Set<String> = [
    "message", "connect", "following", "follow", "more", "pending",
    "my network", "connections", "search", "sort by:", "recently added",
]
let rowEnd: Set<String> = ["message", "connect", "following", "pending"]

func isAnchor(_ line: String) -> Bool {
    let range = NSRange(line.startIndex..., in: line)
    return connectedOn.firstMatch(in: line, range: range) != nil
}

func isRowEnd(_ line: String) -> Bool {
    rowEnd.contains(line.trimmingCharacters(in: .whitespacesAndNewlines).lowercased())
}

func isNoise(_ line: String) -> Bool {
    let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty { return true }
    if chrome.contains(trimmed.lowercased()) { return true }
    let range = NSRange(trimmed.startIndex..., in: trimmed)
    if degreeBadge.firstMatch(in: trimmed, range: range) != nil { return true }
    // Bare punctuation or single characters are always list chrome.
    if trimmed.count <= 2 { return true }
    return false
}

/// Rejects the debris a scrolling capture produces: half-rendered text at the
/// frame edge, motion-blurred rows, and stray UI copy. A real name is a couple
/// of capitalised words with no digits and no comma.
func isPlausibleName(_ raw: String) -> Bool {
    let name = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard name.count >= 3, name.count <= 60 else { return false }
    guard name.rangeOfCharacter(from: .decimalDigits) == nil else { return false }
    guard !name.contains(","), !name.contains(":"), !name.contains("@") else { return false }
    let words = name.split(separator: " ")
    guard words.count >= 2, words.count <= 5 else { return false }
    for word in words {
        guard let first = word.first, first.isUppercase else { return false }
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
            let parts = Array(pending.filter { !isNoise($0) }.suffix(4))
            if let name = parts.first, isPlausibleName(name) {
                found.append(Candidate(
                    name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                    title: parts.dropFirst().joined(separator: " ")
                        .trimmingCharacters(in: .whitespacesAndNewlines)))
            }
            pending = []
        } else if isRowEnd(line) {
            pending = []
        } else {
            pending.append(line)
        }
    }
    return found
}

var observations: [Candidate] = []
var rawLines: [String] = []

for (index, frame) in frames.enumerated() {
    let lines = recognizeLines(in: frame)
    if rawPath != nil {
        rawLines.append("--- frame \(index + 1) ---")
        rawLines.append(contentsOf: lines)
    }
    observations.append(contentsOf: parseEntries(from: lines))
    if (index + 1) % 10 == 0 {
        FileHandle.standardError.write(Data("  \(index + 1)/\(frames.count)\n".utf8))
    }
}

if let rawPath {
    try? rawLines.joined(separator: "\n").write(
        toFile: (rawPath as NSString).expandingTildeInPath, atomically: true, encoding: .utf8)
}

if observations.isEmpty {
    FileHandle.standardError.write(Data("""

    No entries could be paired up. Re-run with --raw /tmp/ocr.txt to see what
    the OCR actually read, and check the recording covers the connections list
    itself — each row needs its "Connected on <date>" line visible.

    """.utf8))
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
    var previous = Array(0...y.count)
    for i in 1...max(x.count, 1) where !x.isEmpty {
        var current = [i] + Array(repeating: 0, count: y.count)
        for j in 1...max(y.count, 1) where !y.isEmpty {
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

// A scroll shows each person in many frames, so the same entry is observed
// repeatedly with occasional OCR slips. Group the observations and let the
// majority reading win, rather than trusting any single frame.
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

var resolved: [Candidate] = groups.compactMap { group in
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

print("\(resolved.count) people → \(outURL.path)")
print("review the CSV before importing — OCR guesses, and the triage swipe is the filter")
