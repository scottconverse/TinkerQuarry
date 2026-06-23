// TinkerQuarry first-party thread helpers.
//
// Thin GPL-2.0 wrapper over vendored BOSL2 (BSD-2-Clause). It keeps a small,
// documented thread surface available after removing the separate tq-threads
// vendor tree. Dimensions are millimeters unless the BOSL2 screw spec says
// otherwise.

include <library/vendor/BOSL2/std.scad>
include <library/vendor/BOSL2/threading.scad>
include <library/vendor/BOSL2/screws.scad>

module tq_threaded_rod(d = 8, pitch = 1.25, length = 20, internal = false,
                       starts = 1, hand = "right", clearance = 0.2, fn = 64) {
    $slop = clearance / 4;
    threaded_rod(
        d = d,
        l = length,
        pitch = pitch,
        starts = starts,
        left_handed = hand == "left",
        internal = internal,
        anchor = BOT,
        $fn = fn
    );
}

module tq_threaded_hole(d = 8, pitch = 1.25, depth = 12, through = true,
                        clearance = 0.2, fn = 64) {
    extra = through ? 0.2 : 0;
    down(extra / 2)
        tq_threaded_rod(
            d = d,
            pitch = pitch,
            length = depth + extra,
            internal = true,
            clearance = clearance,
            fn = fn
        );
}

module tq_metric_bolt(size = 8, pitch = undef, length = 20, head = "hex",
                      drive = "none", thread = true, tolerance = "6g", fn = 64) {
    spec = is_undef(pitch) ? str("M", size) : str("M", size, "x", pitch);
    screw(
        spec,
        head = head,
        drive = drive,
        length = length,
        thread = thread,
        tolerance = tolerance,
        anchor = BOT,
        $fn = fn
    );
}

module tq_metric_nut(size = 8, pitch = undef, shape = "hex", thickness = "normal",
                     tolerance = "6H", hole_oversize = 0.2, fn = 64) {
    spec = is_undef(pitch) ? str("M", size) : str("M", size, "x", pitch);
    nut(
        spec,
        shape = shape,
        thickness = thickness,
        tolerance = tolerance,
        hole_oversize = hole_oversize,
        anchor = BOT,
        $fn = fn
    );
}

module tq_thread_cutter(d = 8, pitch = 1.25, length = 20, through = true,
                        clearance = 0.2, fn = 64) {
    tq_threaded_hole(
        d = d,
        pitch = pitch,
        depth = length,
        through = through,
        clearance = clearance,
        fn = fn
    );
}
