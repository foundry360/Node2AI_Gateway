Node2AI Enterprise VPC Installation
====================================

Version: 1.0.0

This ISO contains the complete Node2AI Enterprise installation package.

INSTALLATION INSTRUCTIONS:
--------------------------

1. Mount this ISO on your VPC instance:
   
   AWS EC2:
   - Attach ISO as EBS volume
   - Mount: sudo mount /dev/xvdf /mnt/iso
   
   Azure VM:
   - Attach ISO as disk
   - Mount: sudo mount /dev/sdc /mnt/iso
   
   Google Cloud:
   - Attach ISO as disk
   - Mount: sudo mount /dev/sdb /mnt/iso

2. Run the installer:
   cd /mnt/iso
   sudo ./install-vpc.sh

3. Access the dashboard:
   http://YOUR_INSTANCE_IP:3000

For detailed instructions, see INSTALL.md

