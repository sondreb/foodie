import assert from 'assert/strict';
import fetch from 'node-fetch';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: resolve(__dirname, '../.env') });

const BASE_URL = 'http://localhost:3000';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {
    console.error('ADMIN_PASSWORD not found in .env file');
    process.exit(1);
}

let adminToken = null;

// Helper function to make API calls
async function callApi(endpoint, options = {}) {
    const url = `${BASE_URL}${endpoint}`;
    const response = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        }
    });
    return { response, data: await response.json() };
}

// Test suite
async function runTests() {
    console.log('Starting API tests...\n');
    let success = 0;
    let failed = 0;

    // Helper to track test results
    const testCase = async (name, fn) => {
        try {
            await fn();
            console.log(`✅ ${name}`);
            success++;
        } catch (error) {
            console.error(`❌ ${name}`);
            console.error(`   Error: ${error.message}`);
            failed++;
        }
    };

    // Test version endpoint
    await testCase('GET /version returns version', async () => {
        const { data } = await callApi('/version');
        assert(data.version, 'Version should be present');
    });

    // Test password hashing
    await testCase('POST /hash-password returns hash', async () => {
        const { data } = await callApi('/hash-password', {
            method: 'POST',
            body: JSON.stringify({ password: 'testpass123' })
        });
        assert(data.hash, 'Hash should be present');
        assert(data.algorithm === 'argon2id', 'Should use argon2id');
    });

    // Test authentication
    await testCase('POST /authenticate/login with admin credentials', async () => {
        const { response, data } = await callApi('/authenticate/login', {
            method: 'POST',
            body: JSON.stringify({
                username: 'admin',
                password: ADMIN_PASSWORD
            })
        });

        assert(response.ok, 'Login should succeed');
        assert(data.success, 'Login response should indicate success');
        assert(data.data.roles.includes('admin'), 'Admin role should be present');

        // Store cookies for subsequent admin tests
        adminToken = response.headers.get('set-cookie');
    });

    // Test admin endpoints (only if we have admin token)
    if (adminToken) {
        await testCase('GET /admin/users returns user list', async () => {
            const { response, data } = await callApi('/admin/users', {
                headers: {
                    Cookie: adminToken
                }
            });
            
            assert(response.ok, 'Should get user list');
            assert(Array.isArray(data.data), 'Should return array of users');
        });

        // Test user creation
        let testUserId;
        await testCase('POST /admin/users creates new user', async () => {
            const { response, data } = await callApi('/admin/users', {
                method: 'POST',
                headers: {
                    Cookie: adminToken
                },
                body: JSON.stringify({
                    username: `test_user_${Date.now()}`,
                    password: 'test123',
                    roles: ['user']
                })
            });

            assert(response.ok, 'Should create user');
            assert(data.success, 'Should indicate success');
            testUserId = data.data._id;
        });

        // Test user update
        if (testUserId) {
            await testCase('PUT /admin/users/:id updates user', async () => {
                const { response } = await callApi(`/admin/users/${testUserId}`, {
                    method: 'PUT',
                    headers: {
                        Cookie: adminToken
                    },
                    body: JSON.stringify({
                        roles: ['user', 'editor']
                    })
                });

                assert(response.ok, 'Should update user');
            });

            // Test user deletion
            await testCase('DELETE /admin/users/:id deletes user', async () => {
                const { response } = await callApi(`/admin/users/${testUserId}`, {
                    method: 'DELETE',
                    headers: {
                        Cookie: adminToken
                    }
                });

                assert(response.ok, 'Should delete user');
            });
        }
    }

    // Test restaurants endpoint
    await testCase('GET /restaurants returns restaurant list', async () => {
        const { data } = await callApi('/restaurants');
        assert(Array.isArray(data), 'Should return array of restaurants');
        assert(data.length > 0, 'Should have at least one restaurant');
    });

    // Print summary
    console.log(`\nTest Summary:`);
    console.log(`Passed: ${success}`);
    console.log(`Failed: ${failed}`);
    console.log(`Total: ${success + failed}`);
}

// Run tests
runTests().catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
});

// Handle cleanup
process.on('SIGINT', () => {
    console.log('\nTests interrupted');
    process.exit(1);
});
