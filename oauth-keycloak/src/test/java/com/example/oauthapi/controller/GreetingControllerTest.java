package com.example.oauthapi.controller;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Map;

import com.example.oauthapi.config.SecurityConfig;
import com.example.oauthapi.utils.KeycloakRealmRoleConverter;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(GreetingController.class)
@Import(SecurityConfig.class)
class GreetingControllerTest {

    @Autowired
    MockMvc mvc;

    @Test
    void rejectsRequestWithoutToken() throws Exception {
        mvc.perform(get("/api/greeting")).andExpect(status().isUnauthorized());
    }

    @Test
    void rejectsTokenWithoutApiUserRole() throws Exception {
        mvc.perform(get("/api/greeting").with(jwt()
                        .jwt(j -> j.claim("preferred_username", "noaccess")
                                .claim("realm_access", Map.of("roles", List.of("offline_access"))))
                        .authorities(new KeycloakRealmRoleConverter())))
                .andExpect(status().isForbidden());
    }

    @Test
    void returnsGreetingForTokenWithApiUserRole() throws Exception {
        mvc.perform(get("/api/greeting").with(jwt()
                        .jwt(j -> j.subject("demo")
                                .claim("preferred_username", "demo")
                                .claim("email", "demo@example.com")
                                .claim("scope", "openid profile")
                                .claim("realm_access", Map.of("roles", List.of("api-user")))
                                .audience(List.of("oauth-keycloak")))
                        .authorities(new KeycloakRealmRoleConverter())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("demo"))
                .andExpect(jsonPath("$.email").value("demo@example.com"))
                .andExpect(jsonPath("$.authorities").value(org.hamcrest.Matchers.hasItems(
                        "ROLE_api-user", "SCOPE_openid", "SCOPE_profile")));
    }
}
