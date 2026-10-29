#!/usr/bin/env python3
"""Patches the C that `goose --standalone` writes so it builds for wasm32 (wasi-sdk clang).

Goose has no wasm backend, so the generated runtime's OS layer (mmap'd data stacks with guard pages, a SIGSEGV
handler, sigaltstack, setjmp) does not exist there. This adds a `__wasm__` branch to that layer:
  - data stacks come from calloc (no guard gap, no lazy commit): an overrun is NOT detected on wasm
  - no fault handler, no signal stack, no native-stack bounds
  - setjmp/longjmp stubs (only used to contain a crashing worker thread; this build has no threads)
Everything else is the compiler's own output, byte for byte. Usage: patch_c.py in.c out.c
"""
import sys

src = open(sys.argv[1]).read()

def sub(old, new, count=1):
    global src
    assert src.count(old) >= 1, "marker not found: " + old[:60]
    src = src.replace(old, new, count)

sub("#include <setjmp.h>\n", """#ifdef __wasm__
typedef int jmp_buf[1];
#define _setjmp(b) 0
#define _longjmp(b, v) __builtin_trap()
#else
#include <setjmp.h>
#endif
""")

SHIM = r'''#elif defined(__wasm__)

/* wasm32 shim (goose/wasm/patch_c.py): no mmap, no signals, no guard pages. */
static size_t gs_page_size = 65536;
#define MADV_DONTNEED 4
static int madvise(void *a, size_t n, int adv) { (void)a; (void)n; (void)adv; return 0; }
static size_t gs_os_page_size(void) { return 65536; }
static void gs_regions_init(void) { gs_page_size = 65536; }
static void gs_native_stack_init(void) {}
static void gs_native_stack_free(void) {}
static uint8_t *gs_os_reserve(size_t usable, size_t size) {
    (void)usable;
    return (uint8_t *)calloc(1, size);
}
static void gs_release_region(const gs_region *r) { free(r->base); }
static int gs_end_first(void) { static int ended; return !ended++; }
static GS_NORETURN void gs_park(void) { for (;;) __builtin_trap(); }

#else  /* posix */'''
sub("#else  /* posix */", SHIM)
open(sys.argv[2], "w").write(src)
