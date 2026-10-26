/* Freestanding libc pieces for the wasm64 build of Goose's generated C (no wasi-libc exists for wasm64).
   Everything the generated runtime needs and nothing more: a bump allocator (free is a no-op; one run
   per page load, memory is returned when the instance is dropped), a tiny printf for error messages,
   frexp/ldexp, strlen, and two host imports (host_write, host_exit). Float printing is not supported. */
#include <stdarg.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

__attribute__((import_module("env"), import_name("host_write"))) void host_write(int fd, const char *p, size_t n);
__attribute__((import_module("env"), import_name("host_exit"), noreturn)) void host_exit(int code);

extern unsigned char __heap_base;
static uintptr_t heap_top;

void *malloc(size_t n) {
    if (!heap_top) heap_top = ((uintptr_t)&__heap_base + 15) & ~(uintptr_t)15;
    n = (n + 15) & ~(size_t)15;
    uintptr_t p = heap_top, end = p + n;
    size_t have = __builtin_wasm_memory_size(0) * 65536;
    if (end > have) {
        size_t pages = (end - have + 65535) / 65536;
        if (__builtin_wasm_memory_grow(0, pages) == (size_t)-1) return 0;
    }
    heap_top = end;
    return (void *)p;
}
void *calloc(size_t a, size_t b) {
    void *p = malloc(a * b);
    if (p) memset(p, 0, a * b);
    return p;
}
void free(void *p) { (void)p; }
void _Exit(int code) { host_exit(code); }
size_t strlen(const char *s) { size_t n = 0; while (s[n]) n++; return n; }

/* FILE * values are just the file descriptor numbers. */
FILE *const stderr = (FILE *)2, *const stdout = (FILE *)1;
int fflush(FILE *f) { (void)f; return 0; }
int setvbuf(FILE *f, char *b, int m, size_t s) { (void)f; (void)b; (void)m; (void)s; return 0; }
size_t fwrite(const void *p, size_t sz, size_t n, FILE *f) { host_write((int)(uintptr_t)f, (const char *)p, sz * n); return n; }

/* %s %c %d %i %u %x %p, with l/ll/z/h length modifiers, %%; width and precision ignored (except %.*s). */
int vsnprintf(char *buf, size_t cap, const char *fmt, va_list ap) {
    size_t len = 0;
#define PUT(c) do { if (len + 1 < cap) buf[len] = (c); len++; } while (0)
    for (; *fmt; fmt++) {
        if (*fmt != '%') { PUT(*fmt); continue; }
        fmt++;
        int prec = -1, lng = 0;
        while (*fmt == '-' || *fmt == '0' || *fmt == '+' || *fmt == ' ' || (*fmt >= '1' && *fmt <= '9')) fmt++;
        if (*fmt == '.') { fmt++; if (*fmt == '*') { prec = va_arg(ap, int); fmt++; } else { prec = 0; while (*fmt >= '0' && *fmt <= '9') prec = prec * 10 + (*fmt++ - '0'); } }
        while (*fmt == 'l' || *fmt == 'z' || *fmt == 'h' || *fmt == 'j' || *fmt == 't') { if (*fmt != 'h') lng = 1; fmt++; }
        char c = *fmt;
        if (c == '%') PUT('%');
        else if (c == 'c') PUT((char)va_arg(ap, int));
        else if (c == 's') { const char *s = va_arg(ap, const char *); if (!s) s = "(null)"; for (int i = 0; s[i] && (prec < 0 || i < prec); i++) PUT(s[i]); }
        else if (c == 'd' || c == 'i' || c == 'u' || c == 'x' || c == 'X' || c == 'p') {
            uint64_t v; int neg = 0; unsigned base = (c == 'x' || c == 'X' || c == 'p') ? 16 : 10;
            if (c == 'd' || c == 'i') { int64_t s = lng ? va_arg(ap, int64_t) : va_arg(ap, int); if (s < 0) { neg = 1; v = (uint64_t)0 - (uint64_t)s; } else v = (uint64_t)s; }
            else v = lng || c == 'p' ? va_arg(ap, uint64_t) : va_arg(ap, unsigned);
            char tmp[24]; int t = 0;
            do { unsigned d = (unsigned)(v % base); tmp[t++] = (char)(d < 10 ? '0' + d : (c == 'X' ? 'A' : 'a') + d - 10); v /= base; } while (v);
            if (neg) PUT('-');
            if (c == 'p') { PUT('0'); PUT('x'); }
            while (t) PUT(tmp[--t]);
        } else { PUT('?'); }
    }
    if (cap) buf[len < cap ? len : cap - 1] = 0;
    return (int)len;
}
int snprintf(char *b, size_t n, const char *f, ...) { va_list ap; va_start(ap, f); int r = vsnprintf(b, n, f, ap); va_end(ap); return r; }
int fprintf(FILE *f, const char *fmt, ...) {
    char buf[512]; va_list ap; va_start(ap, fmt); int r = vsnprintf(buf, sizeof buf, fmt, ap); va_end(ap);
    host_write((int)(uintptr_t)f, buf, r < (int)sizeof buf ? (size_t)r : sizeof buf - 1);
    return r;
}

double frexp(double x, int *e) {
    union { double d; uint64_t u; } v = { x };
    int ex = (int)((v.u >> 52) & 0x7ff);
    if (ex == 0 || ex == 0x7ff) { *e = 0; if (ex == 0 && x != 0) { x *= 18014398509481984.0; v.d = x; ex = (int)((v.u >> 52) & 0x7ff); *e = -54; } else return x; }
    *e += ex - 1022;
    v.u = (v.u & ~(0x7ffull << 52)) | (1022ull << 52);
    return v.d;
}
double ldexp(double x, int e) {
    while (e > 1000) { x *= 0x1p1000; e -= 1000; }
    while (e < -1000) { x *= 0x1p-1000; e += 1000; }
    union { double d; uint64_t u; } s = { 0 };
    s.u = (uint64_t)(e + 1023) << 52;
    return x * s.d;
}
