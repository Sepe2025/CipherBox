package com.g.vault;

import android.app.Application;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;

/* 任何未捕获的崩溃都把堆栈写进系统的「下载」文件夹（免权限），
   文件管理器里直接能看到 —— 闪退不再是无声的黑盒。 */
public class CrashApp extends Application {
    @Override public void onCreate() {
        super.onCreate();
        final Thread.UncaughtExceptionHandler prev = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
            @Override public void uncaughtException(Thread t, Throwable e) {
                try {
                    StringWriter sw = new StringWriter();
                    sw.append("thread: ").append(t.getName()).append("\n\n");
                    e.printStackTrace(new PrintWriter(sw));
                    writeCrash(sw.toString());
                } catch (Throwable ignore) {}
                if (prev != null) prev.uncaughtException(t, e);
            }
        });
    }

    private void writeCrash(String text) {
        byte[] data = text.getBytes();
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.MediaColumns.DISPLAY_NAME, "vault-crash.txt");
                cv.put(MediaStore.MediaColumns.MIME_TYPE, "text/plain");
                cv.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                OutputStream os = getContentResolver().openOutputStream(uri);
                os.write(data); os.close();
                return;
            }
        } catch (Throwable ignore) {}
        try {
            File dir = new File(getExternalFilesDir(null), "crash");
            dir.mkdirs();
            OutputStream os = new FileOutputStream(new File(dir, "vault-crash.txt"));
            os.write(data); os.close();
        } catch (Throwable ignore) {}
    }
}
