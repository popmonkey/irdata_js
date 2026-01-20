export class PKCEHelper {
    /**
     * Generates a random string for the code verifier.
     * @param length Length of the string (43-128 characters recommended)
     */
    static generateVerifier(length: number = 128): string {
        const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
        let result = '';
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            const values = new Uint8Array(length);
            crypto.getRandomValues(values);
            for (let i = 0; i < length; i++) {
                result += charset[values[i] % charset.length];
            }
        } else {
            // Fallback for environments without crypto.getRandomValues (though Node 18+ and browsers have it)
            for (let i = 0; i < length; i++) {
                result += charset.charAt(Math.floor(Math.random() * charset.length));
            }
        }
        return result;
    }

    /**
     * Generates the code challenge from the verifier using SHA-256.
     * @param verifier The code verifier string
     */
    static async generateChallenge(verifier: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(verifier);
        
        if (typeof crypto !== 'undefined' && crypto.subtle) {
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            return this.base64URLEncode(hashBuffer);
        } else {
            // Fallback for insecure contexts or environments without crypto.subtle
            const hashBuffer = this.sha256(data);
            return this.base64URLEncode(hashBuffer);
        }
    }

    private static base64URLEncode(buffer: ArrayBuffer): string {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        return base64
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    private static sha256(data: Uint8Array): ArrayBuffer {
        const K = [
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
            0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
            0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
            0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
            0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
            0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
            0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
        ];

        function rotr(n: number, x: number) { return (x >>> n) | (x << (32 - n)); }
        function ch(x: number, y: number, z: number) { return (x & y) ^ (~x & z); }
        function maj(x: number, y: number, z: number) { return (x & y) ^ (x & z) ^ (y & z); }
        function sigma0(x: number) { return rotr(2, x) ^ rotr(13, x) ^ rotr(22, x); }
        function sigma1(x: number) { return rotr(6, x) ^ rotr(11, x) ^ rotr(25, x); }
        function gamma0(x: number) { return rotr(7, x) ^ rotr(18, x) ^ (x >>> 3); }
        function gamma1(x: number) { return rotr(17, x) ^ rotr(19, x) ^ (x >>> 10); }

        const bytes = new Uint8Array(data);
        const len = bytes.length * 8;
        
        // Padding
        const paddingLen = (len + 64 >>> 9 << 4) + 16;
        const words = new Uint32Array(paddingLen);
        for (let i = 0; i < bytes.length; i++) words[i >>> 2] |= bytes[i] << (24 - (i % 4) * 8);
        words[bytes.length >>> 2] |= 0x80 << (24 - (bytes.length % 4) * 8);
        words[paddingLen - 1] = len;

        let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

        const W = new Uint32Array(64);
        for (let i = 0; i < words.length; i += 16) {
            W.fill(0);
            for (let j = 0; j < 16; j++) W[j] = words[i + j];
            for (let j = 16; j < 64; j++) W[j] = (gamma1(W[j - 2]) + W[j - 7] + gamma0(W[j - 15]) + W[j - 16]) | 0;

            let [a, b, c, d, e, f, g, h] = H;

            for (let j = 0; j < 64; j++) {
                const T1 = (h + sigma1(e) + ch(e, f, g) + K[j] + W[j]) | 0;
                const T2 = (sigma0(a) + maj(a, b, c)) | 0;
                h = g; g = f; f = e; e = (d + T1) | 0; d = c; c = b; b = a; a = (T1 + T2) | 0;
            }

            H[0] = (H[0] + a) | 0;
            H[1] = (H[1] + b) | 0;
            H[2] = (H[2] + c) | 0;
            H[3] = (H[3] + d) | 0;
            H[4] = (H[4] + e) | 0;
            H[5] = (H[5] + f) | 0;
            H[6] = (H[6] + g) | 0;
            H[7] = (H[7] + h) | 0;
        }

        const buffer = new ArrayBuffer(32);
        const view = new DataView(buffer);
        H.forEach((h, i) => view.setUint32(i * 4, h, false));
        return buffer;
    }
}