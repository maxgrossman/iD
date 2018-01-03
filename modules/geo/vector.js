// vector equals
export function geoVecEqual(a, b) {
    return (a[0] === b[0]) && (a[1] === b[1]);
}

// vector addition
export function geoVecAdd(a, b) {
    return [ a[0] + b[0], a[1] + b[1] ];
}

// vector subtraction
export function geoVecSubtract(a, b) {
    return [ a[0] - b[0], a[1] - b[1] ];
}

// vector multiplication
export function geoVecScale(a, b) {
    return [ a[0] * b, a[1] * b ];
}

// vector rounding (was: geoRoundCoordinates)
export function geoVecFloor(a) {
    return [ Math.floor(a[0]), Math.floor(a[1]) ];
}

// linear interpolation
export function geoVecInterp(a, b, t) {
    return [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t
    ];
}

// http://jsperf.com/id-dist-optimization
export function geoVecLength(a, b) {
    var x = a[0] - b[0];
    var y = a[1] - b[1];
    return Math.sqrt((x * x) + (y * y));
}

// Return the counterclockwise angle in the range (-pi, pi)
// between the positive X axis and the line intersecting a and b.
export function geoVecAngle(a, b) {
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
}

// dot product
export function geoVecDot(a, b, origin) {
    origin = origin || [0, 0];
    return (a[0] - origin[0]) * (b[0] - origin[0]) +
        (a[1] - origin[1]) * (b[1] - origin[1]);
}

// 2D cross product of OA and OB vectors, returns magnitude of Z vector
// Returns a positive value, if OAB makes a counter-clockwise turn,
// negative for clockwise turn, and zero if the points are collinear.
export function geoVecCross(a, b, origin) {
    origin = origin || [0, 0];
    return (a[0] - origin[0]) * (b[1] - origin[1]) -
        (a[1] - origin[1]) * (b[0] - origin[0]);
}

// returns vector perpendicular to a, b 
// scaled by a provide `mag`, or magnitude 
export function geoVecPerp(a, b, mag, len) {
    return len === 0 ? [0, 0] : [
        ((b[1] - a[1]) / len) * mag,
        ((b[0] - a[0]) / len) * mag * -1
    ];
}