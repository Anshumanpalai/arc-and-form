package com.arcandform.order;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

@Embeddable
public class ShippingAddress {
    @Column(name = "shipping_full_name", nullable = false)
    private String fullName;

    @Column(name = "shipping_address_line1", nullable = false)
    private String addressLine1;

    @Column(name = "shipping_address_line2")
    private String addressLine2;

    @Column(name = "shipping_city", nullable = false)
    private String city;

    @Column(name = "shipping_state", nullable = false)
    private String state;

    @Column(name = "shipping_postal_code", nullable = false)
    private String postalCode;

    @Column(name = "shipping_country", nullable = false)
    private String country;

    public ShippingAddress() {}

    public ShippingAddress(String fullName, String addressLine1, String addressLine2, String city, String state, String postalCode, String country) {
        this.fullName = fullName;
        this.addressLine1 = addressLine1;
        this.addressLine2 = addressLine2;
        this.city = city;
        this.state = state;
        this.postalCode = postalCode;
        this.country = country;
    }

    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }

    public String getAddressLine1() { return addressLine1; }
    public void setAddressLine1(String addressLine1) { this.addressLine1 = addressLine1; }

    public String getAddressLine2() { return addressLine2; }
    public void setAddressLine2(String addressLine2) { this.addressLine2 = addressLine2; }

    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }

    public String getState() { return state; }
    public void setState(String state) { this.state = state; }

    public String getPostalCode() { return postalCode; }
    public void setPostalCode(String postalCode) { this.postalCode = postalCode; }

    public String getCountry() { return country; }
    public void setCountry(String country) { this.country = country; }
}
