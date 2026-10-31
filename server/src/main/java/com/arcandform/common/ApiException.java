package com.arcandform.common;

import org.springframework.http.HttpStatus;

public class ApiException extends RuntimeException {
    private final HttpStatus status;

    public ApiException(String message, HttpStatus status) {
        super(message);
        this.status = status;
    }

    public ApiException(String message, int statusCode) {
        super(message);
        this.status = HttpStatus.valueOf(statusCode);
    }

    public HttpStatus getStatus() {
        return status;
    }
}
