fn main() {
    // WebKitGTK's DMABUF renderer crashes on a number of Linux GPU/compositor
    // stacks — notably Wayland compositors such as Hyprland and many NVIDIA
    // setups — aborting at startup with:
    //   Could not create default EGL display: EGL_BAD_PARAMETER. Aborting...
    // Disabling that renderer falls back to a path that works everywhere, which
    // is what makes the AppImage launch on those systems. We only set it when
    // the user hasn't already chosen a value, so it stays overridable.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    cheatsheet_maker_lib::run();
}
