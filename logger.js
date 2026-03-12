export function logApiCall(service, action, startTime, endTime, details = {}) {
  const duration = endTime - startTime;
  const timestamp = new Date().toISOString();
  
  console.log(`\n🔵 [${timestamp}] ${service.toUpperCase()}`);
  console.log(`   Action: ${action}`);
  console.log(`   Duration: ${duration}ms`);
  
  if (details.prompt) {
    console.log(`   Prompt: ${details.prompt.substring(0, 100)}${details.prompt.length > 100 ? '...' : ''}`);
  }
  
  if (details.text) {
    console.log(`   Text: ${details.text.substring(0, 100)}${details.text.length > 100 ? '...' : ''}`);
  }
  
  if (details.response) {
    console.log(`   Response: ${details.response.substring(0, 100)}${details.response.length > 100 ? '...' : ''}`);
  }
  
  if (details.error) {
    console.log(`   ❌ Error: ${details.error}`);
  }
  
  console.log(`   ⏱️  Total: ${duration}ms\n`);
}

export function logTwilioCall(action, details = {}) {
  const timestamp = new Date().toISOString();
  console.log(`\n📞 [${timestamp}] TWILIO`);
  console.log(`   Action: ${action}`);
  
  if (details.callSid) {
    console.log(`   Call SID: ${details.callSid}`);
  }
  
  if (details.speechResult) {
    console.log(`   Speech: "${details.speechResult}"`);
  }
  
  if (details.digits) {
    console.log(`   DTMF: ${details.digits}`);
  }
  
  if (details.audioUrl) {
    console.log(`   Audio: ${details.audioUrl}`);
  }
  
  if (details.text) {
    console.log(`   Text: "${details.text}"`);
  }
  
  if (details.extra) {
    console.log(`   Extra: ${JSON.stringify(details.extra)}`);
  }
  
  console.log(`\n`);
}

export function logPerformance(service, duration, threshold = 1000) {
  if (duration > threshold) {
    console.log(`⚠️  SLOW API CALL: ${service} took ${duration}ms (threshold: ${threshold}ms)`);
  }
}
