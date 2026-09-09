// Point Enigma Config at the current localhost.run tunnel.
Enigma_Config__c cfg = Enigma_Config__c.getOrgDefaults();
cfg.Endpoint_URL__c = 'https://0ae2476ba757b2.lhr.life';
if (String.isBlank(cfg.Application_Id__c)) {
  cfg.Application_Id__c = 'app_clinical';
}
if (String.isBlank(cfg.Api_Key__c)) {
  cfg.Api_Key__c = 'n2ai_test_key_approved_app';
}
if (String.isBlank(cfg.Admin_Api_Key__c)) {
  cfg.Admin_Api_Key__c = 'n2ai_admin_e20632ce2df065408d9d6625';
}
upsert cfg;
System.debug('Enigma Config Endpoint_URL__c=' + cfg.Endpoint_URL__c);
