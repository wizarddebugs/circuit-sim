// solver.js

export function solve(A, b) {
    const n = b.length;
    // Create augmented matrix [A | b]
    const M = A.map((row, i) => [...row, b[i]]);

    // Forward Elimination with Partial Pivoting
    for (let i = 0; i < n; i++) {
        let maxRow = i;
        for (let k = i + 1; k < n; k++) {
            if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) {
                maxRow = k;
            }
        }

        // Swap rows
        [M[i], M[maxRow]] = [M[maxRow], M[i]];

        // Check for singular matrix
        if (Math.abs(M[i][i]) < 1e-12) {
            throw new Error(`Matrix is singular or nearly singular at row ${i}`);
        }

        // Eliminate column entries below pivot
        for (let k = i + 1; k < n; k++) {
            const factor = M[k][i] / M[i][i];
            for (let j = i; j <= n; j++) {
                M[k][j] -= factor * M[i][j];
            }
        }
    }

    // Back Substitution
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
        let sum = 0;
        for (let j = i + 1; j < n; j++) {
            sum += M[i][j] * x[j];
        }
        x[i] = (M[i][n] - sum) / M[i][i];
    }

    return x;
}